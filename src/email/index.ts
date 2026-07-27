import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext } from "@cloudflare/workers-types";
import type { Address } from "postal-mime";
import type { PostHog } from "posthog-node";
import { createPosthogClient } from "../posthog";
import { getNotion } from "../lib/notion";
import { syncJobApplication } from "../lib/job-applications";
import type { AiChatResponse, ExtractionResult } from "./extract";
import { buildPrompt, parseResponse, SYSTEM_PROMPT, JSON_SCHEMA, GEMINI_MODEL } from "./extract";

const fromToString = (from: Address | undefined): string => {
  if (!from) return "";
  if ("group" in from && from.group) return from.name || "";
  return from.name ? `${from.name} <${from.address}>` : from.address || "";
};

async function extract(bodyText: string, subject: string, from: string, env: any, posthog?: PostHog | null) {
  const traceId = crypto.randomUUID();
  const spanId = crypto.randomUUID();
  const prompt = buildPrompt(bodyText, subject, from);
  const messages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nReturn ONLY valid JSON matching this schema, no other text:\n${JSON.stringify(JSON_SCHEMA)}`,
    },
    { role: "user", content: prompt },
  ];

  console.log("[ai] Sending to model", { model: GEMINI_MODEL, promptLength: prompt.length, bodyPreview: bodyText.slice(0, 200) });

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
  console.log("[ai] Raw response:", typeof raw, raw?.slice?.(0, 300));

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
      },
    });
  }

  return parseResponse(raw) as ExtractionResult;
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
  env: { AI: { run: (model: string, input: any) => Promise<any> }; POSTHOG_API_KEY?: string; POSTHOG_HOST?: string; NOTION_API_KEY?: string },
  ctx: ExecutionContext,
) {
  const emailFrom = message.from;
  const emailTo = message.to;

  const posthog = createPosthogClient(env);

  console.log("[email] Received", { from: emailFrom, to: emailTo, size: message.rawSize });

  try {
    const parsed = await PostalMime.parse(message.raw);
    console.log("[email] Parsed", { subject: parsed.subject, from: fromToString(parsed.from), hasText: !!parsed.text, hasHtml: !!parsed.html, attachmentCount: parsed.attachments.length });

    const bodyText = parsed.text || parsed.html || "";
    const extracted = await extract(bodyText, parsed.subject || "", fromToString(parsed.from), env, posthog);
    console.log("[ai] Parsed result:", JSON.stringify(extracted));

    if (posthog) {
      ctx.waitUntil(posthog.shutdown());
    }

    ctx.waitUntil(
      (async () => {
        try {
          if (extracted.type !== "not_job_related") {
            console.log("[result] Job application:", JSON.stringify(extracted, null, 2));

            try {
              const notion = getNotion(env);
              await syncJobApplication(notion, extracted, bodyText, parsed.subject || "");
              console.log("[notion] Sync complete");
            } catch (err) {
              console.error("[notion] Failed to sync:", err);
              posthog?.captureException(err, extracted.from, { source: "notion_sync" });
            }
          } else {
            console.log("[result] Not job-related, skipping");
          }
        } catch (error) {
          console.error("[result] Failed to process:", error);
          posthog?.captureException(error, emailFrom, { source: "email_processing" });
        }
      })(),
    );
  } catch (error) {
    console.error("[email] Failed to process incoming email:", error);
    posthog?.captureException(error, emailFrom, { source: "email_ingress" });
    if (posthog) ctx.waitUntil(posthog.shutdown());
  }
}
