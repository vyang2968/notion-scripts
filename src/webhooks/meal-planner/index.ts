import { Context } from "hono";
import { PopulateWebhookEventType } from "./types";
import { validateWebhook, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent(event: PopulateWebhookEventType) {}

export async function handle(c: Context) {
  const isVerified = await verifyWebhook(c);
  if (!isVerified) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.json();
  const event = await validateWebhook(body);
  if (!event) {
    return c.json({ error: "Invalid payload shape" }, 400);
  }

  console.log("Received webhook event", JSON.stringify(event));

  c.executionCtx.waitUntil(
    (async () => {
      try {
        switch (event.type) {
          case "populate":
            await handlePopulateWebhookEvent(event);
            break;
          default:
            console.log("Unknown event type", event.type);
        }
      } catch (error) {
        console.error(
          "Failed to process Notion automation background event:",
          error,
        );
      }
    })(),
  );

  return c.json({ success: true }, 200);
}
