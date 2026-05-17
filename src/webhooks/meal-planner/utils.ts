import { Context } from "hono";
import { MealPlannerWebhookEvent } from "./types";

export async function validateWebhook(input: unknown) {
  const parseResult = MealPlannerWebhookEvent.safeParse(input);
  if (!parseResult.success) {
    console.warn("Invalid event", parseResult.error);
    return;
  }
  return parseResult.data;
}

export async function verifyWebhook(c: Context) {
  const authHeader = c.req.header("Authorization");
  const expectedToken = `Bearer ${c.env.NOTION_WEBHOOK_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return false;
  }

  return true;
}
