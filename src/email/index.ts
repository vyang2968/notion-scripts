import PostalMime from "postal-mime";
import type { ForwardableEmailMessage, ExecutionContext } from "@cloudflare/workers-types";

export async function email(
  message: ForwardableEmailMessage,
  env: { AI: { run: (model: string, input: any) => Promise<any> } },
  ctx: ExecutionContext,
) {
  const parsed = await PostalMime.parse(message.raw);
  console.log("From:", parsed.from);
  console.log("Subject:", parsed.subject);
  console.log("Text:", parsed.text?.slice(0, 500));
  await message.forward("vyang@hey.com");
}
