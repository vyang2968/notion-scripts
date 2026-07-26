import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext } from "@cloudflare/workers-types";
import type { Address } from "postal-mime";
import type { PostHog } from "posthog-node";
import { createPosthogClient } from "../posthog";
import type { AiChatResponse, ExtractionResult } from "./extract";
import { buildPrompt, parseResponse, SYSTEM_PROMPT, JSON_SCHEMA } from "./extract";

const fromToString = (from: Address | undefined): string => {
  if (!from) return "";
  if ("group" in from && from.group) return from.name || "";
  return from.name ? `${from.name} <${from.address}>` : from.address || "";
};

async function extract(bodyText: string, subject: string, from: string, env: any, posthog?: PostHog | null) {
  const prompt = buildPrompt(bodyText, subject, from);
  const messages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nReturn ONLY valid JSON matching this schema, no other text:\n${JSON.stringify(JSON_SCHEMA)}`,
    },
    { role: "user", content: prompt },
  ];

  console.log("[ai] Sending to model", {
    model: "@cf/google/gemma-4-26b-a4b-it",
    promptLength: prompt.length,
    bodyPreview: bodyText.slice(0, 200),
  });

  const startTime = performance.now();
  const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", { messages });
  const latencyMs = performance.now() - startTime;

  const aiResponse = result as AiChatResponse;
  const raw = aiResponse.response ?? aiResponse.choices?.[0]?.message?.content;
  console.log("[ai] Raw response:", typeof raw, raw?.slice?.(0, 300));

  if (posthog) {
    const usage = aiResponse.usage;
    posthog.captureImmediate({
      distinctId: from || "unknown",
      event: "$ai_generation",
      properties: {
        $ai_model: "@cf/google/gemma-4-26b-a4b-it",
        $ai_provider: "cloudflare-workers-ai",
        $ai_input: messages,
        $ai_output_choices: [{ content: raw }],
        $ai_latency: latencyMs / 1000,
        $ai_input_tokens: usage?.prompt_tokens ?? null,
        $ai_output_tokens: usage?.completion_tokens ?? null,
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
  env: { AI: { run: (model: string, input: any) => Promise<any> }; POSTHOG_API_KEY?: string; POSTHOG_HOST?: string },
  ctx: ExecutionContext,
) {
  const posthog = createPosthogClient(env);

  const emailFrom = message.from;
  const emailTo = message.to;
  console.log("[email] Received", { from: emailFrom, to: emailTo, size: message.rawSize });

  const parsed = await PostalMime.parse(message.raw);
  console.log("[email] Parsed", {
    subject: parsed.subject,
    from: fromToString(parsed.from),
    hasText: !!parsed.text,
    hasHtml: !!parsed.html,
    attachmentCount: parsed.attachments.length,
  });

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
        } else {
          console.log("[result] Not job-related, skipping");
        }
      } catch (error) {
        console.error("[result] Failed to process:", error);
      }
    })(),
  );

}
