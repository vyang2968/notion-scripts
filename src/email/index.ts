import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext, D1Database } from "@cloudflare/workers-types";
import type { Address } from "postal-mime";
import type { PostHog } from "posthog-node";
import { createPosthogClient } from "../posthog";
import { createLogger } from "../lib/logger";
import { getNotion } from "../lib/notion";
import { syncJobApplication } from "../lib/job-applications";
import { extractTermCounts, recordTerms } from "../lib/keyword-extraction";
import { compilePrompt, fetchSystemPrompt } from "../lib/ai-prompt";
import type { AiChatResponse, ExtractionResult } from "./extract";
import { buildPrompt, parseResponse, JSON_SCHEMA, GEMINI_MODEL } from "./extract";

const log = createLogger("email");

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const formatDate = (d: Date | string | undefined): string | undefined => {
  if (!d) return undefined;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString().split("T")[0];
};

const fromToString = (from: Address | undefined): string => {
  if (!from) return "";
  if ("group" in from && from.group) return from.name || "";
  return from.name ? `${from.name} <${from.address}>` : from.address || "";
};

async function extract(bodyText: string, subject: string, from: string, env: any, posthog?: PostHog | null, sentDate?: string) {
  const traceId = crypto.randomUUID();
  const spanId = crypto.randomUUID();
  const prompt = buildPrompt(bodyText, subject, from, sentDate);
  const dateRef = sentDate ? `The email was sent on ${sentDate}.` : `Today's date is ${new Date().toISOString().split("T")[0]}.`;
  const systemPrompt = compilePrompt(await fetchSystemPrompt(env), {
    date_ref: dateRef,
    json_schema: JSON.stringify(JSON_SCHEMA),
  });
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  log.log({ component: "ai", event: "sending_to_model", model: GEMINI_MODEL, promptLength: prompt.length, bodyPreview: bodyText.slice(0, 200) });

  const startTime = performance.now();
  let result: unknown;
  try {
    result = await env.AI.run(GEMINI_MODEL, { messages });
  } catch (err) {
    const latencyMs = performance.now() - startTime;
    if (posthog) {
      posthog.captureImmediate({
        distinctId: from || "unknown",
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_span_id: spanId,
          $ai_span_name: "email_extraction",
          $ai_model: GEMINI_MODEL,
          $ai_provider: "cloudflare-workers-ai",
          $ai_input: messages,
          $ai_latency: latencyMs / 1000,
          $ai_is_error: true,
          $ai_error: String(err),
          $ai_stream: false,
        },
      });
      posthog.captureException(err, from, { source: "ai_extraction", model: GEMINI_MODEL });
    }
    throw err;
  }
  const latencyMs = performance.now() - startTime;

  const aiResponse = result as AiChatResponse;
  const aiChoice = aiResponse.choices?.[0];
  const raw = aiResponse.response ?? aiChoice?.message?.content;
  log.log({ component: "ai", event: "raw_response", type: typeof raw, preview: raw?.slice?.(0, 300) });

  const parsed = parseResponse(raw) as ExtractionResult;
  if (parsed.type !== "not_job_related" && sentDate) {
    parsed.applicationDate = sentDate;
  }
  if (parsed.type !== "not_job_related" && parsed.status === "online assessment" && !parsed.oaDeadlineDate) {
    parsed.oaDeadlineDate = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) ?? null;
  }

  if (posthog) {
    const usage = aiResponse.usage;
    posthog.captureImmediate({
      distinctId: from || "unknown",
      event: "$ai_generation",
      properties: {
        $ai_trace_id: traceId,
        $ai_span_id: spanId,
        $ai_span_name: "email_extraction",
        $ai_model: GEMINI_MODEL,
        $ai_provider: "cloudflare-workers-ai",
        $ai_input: messages,
        $ai_input_tokens: usage?.prompt_tokens ?? null,
        $ai_output_choices: [{ role: "assistant", content: raw }],
        $ai_output_tokens: usage?.completion_tokens ?? null,
        $ai_latency: latencyMs / 1000,
        $ai_stop_reason: aiChoice?.finish_reason ?? null,
        $ai_stream: false,
        job_related: parsed.type !== "not_job_related",
        ai_result_type: parsed.type,
        ...(parsed.type !== "not_job_related"
          ? {
              ai_company: parsed.company,
              ai_position: parsed.position,
              ai_status: parsed.status,
              ai_application_date: parsed.applicationDate,
            }
          : {}),
      },
    });
  }

  return parsed;
}

export async function testAiExtraction(env: any, waitUntil?: (p: Promise<any>) => void): Promise<{ success: boolean; result: ExtractionResult }> {
  const posthog = createPosthogClient(env);

  const sampleEmail = `Thank you for applying to the Senior Software Engineer position at Acme Corp. We're excited to review your application and will be in touch soon.

Best regards,
HR Team`;

  const result = await extract(sampleEmail, "Application Received: Senior Software Engineer - Acme Corp", "hr@acmecorp.com", env, posthog);

  if (posthog && waitUntil) {
    waitUntil(posthog.shutdown());
  }

  return { success: result.type !== "not_job_related", result };
}

export async function email(
  message: ForwardableEmailMessage,
  env: { AI: { run: (model: string, input: any) => Promise<any> }; POSTHOG_API_KEY?: string; POSTHOG_HOST?: string; POSTHOG_PERSONAL_API_KEY?: string; NOTION_API_KEY?: string; DB?: D1Database },
  ctx: ExecutionContext,
) {
  const emailFrom = message.from;
  const emailTo = message.to;

  const posthog = createPosthogClient(env);

  log.log({ component: "ingress", event: "received", from: emailFrom, to: emailTo, size: message.rawSize });

  try {
    const parsed = await PostalMime.parse(message.raw);
    log.log({ component: "ingress", event: "parsed", subject: parsed.subject, from: fromToString(parsed.from), hasText: !!parsed.text, hasHtml: !!parsed.html, attachmentCount: parsed.attachments.length });

    const bodyText = parsed.text || parsed.html || "";
    const dateValue = parsed.date ? formatDate(parsed.date) : undefined;
    const extracted = await extract(bodyText, parsed.subject || "", fromToString(parsed.from), env, posthog, dateValue);
    log.log({ component: "ai", event: "parsed_result", extracted });

    if (posthog) {
      ctx.waitUntil(posthog.shutdown());
    }

    ctx.waitUntil(
      (async () => {
        try {
          if (extracted.type !== "not_job_related") {
            log.log({ component: "result", event: "job_application", extracted });

            const bodyText = parsed.text || stripHtml(parsed.html || "") || "";
            await recordTerms(env.DB, extractTermCounts(`${parsed.subject || ""} ${bodyText}`));

            try {
              const notion = getNotion(env);
              await syncJobApplication(notion, extracted, bodyText, parsed.subject || "");
              log.log({ component: "notion", event: "sync_complete" });
            } catch (err) {
              log.error({ component: "notion", event: "sync_failed", error: String(err) });
              posthog?.captureException(err, extracted.from, { source: "notion_sync" });
            }
          } else {
            log.log({ component: "result", event: "not_job_related" });
          }
        } catch (error) {
          log.error({ component: "result", event: "process_failed", error: String(error) });
          posthog?.captureException(error, emailFrom, { source: "email_processing" });
        }
      })(),
    );
  } catch (error) {
    log.error({ component: "ingress", event: "process_failed", error: String(error) });
    posthog?.captureException(error, emailFrom, { source: "email_ingress" });
    if (posthog) ctx.waitUntil(posthog.shutdown());
  }
}
