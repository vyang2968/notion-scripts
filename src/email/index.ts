import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext } from "@cloudflare/workers-types";
import type { Address } from "postal-mime";
import type { ExtractionResult } from "./extract";
import { buildPrompt, SYSTEM_PROMPT, JSON_SCHEMA } from "./extract";

const fromToString = (from: Address | undefined): string => {
  if (!from) return "";
  if ("group" in from && from.group) return from.name || "";
  return from.name ? `${from.name} <${from.address}>` : from.address || "";
};

export async function email(
  message: ForwardableEmailMessage,
  env: { AI: { run: (model: string, input: any) => Promise<any> } },
  ctx: ExecutionContext,
) {
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
  const prompt = buildPrompt(bodyText, parsed.subject || "", fromToString(parsed.from));
  console.log("[ai] Sending to model", {
    model: "@cf/meta/llama-3.1-8b-instruct",
    promptLength: prompt.length,
    bodyPreview: bodyText.slice(0, 200),
  });

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: JSON_SCHEMA,
    },
  });

  console.log("[ai] Raw response type:", typeof result.response);

  const extracted = result.response as ExtractionResult;
  console.log("[ai] Parsed result:", JSON.stringify(extracted));

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
