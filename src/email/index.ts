import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext } from "@cloudflare/workers-types";
import type { Address } from "postal-mime";
import { buildPrompt, parseResponse, SYSTEM_PROMPT } from "./extract";

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
  const parsed = await PostalMime.parse(message.raw);

  const prompt = buildPrompt(
    parsed.text || parsed.html || "",
    parsed.subject || "",
    fromToString(parsed.from),
  );

  const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  const extracted = parseResponse(result.response);

  ctx.waitUntil(
    (async () => {
      try {
        if (extracted.type !== "not_job_related") {
          console.log("Job application detected:", JSON.stringify(extracted, null, 2));
        } else {
          console.log("Not job-related, skipping");
        }
      } catch (error) {
        console.error("Failed to process extracted data:", error);
      }
    })(),
  );

  await message.forward("vyang@hey.com");
}
