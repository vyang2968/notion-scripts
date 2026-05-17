import { Context } from "hono";

export function getWebhookEventType(c: Context) {
  const typeHeader = c.req.header("Webhook-Type");
  return String(typeHeader);
}

export async function verifyWebhook(c: Context) {
  const authHeader = c.req.header("Authorization");

  const expectedToken = `Bearer ${c.env.NOTION_WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return false;
  }

  return true;
}
