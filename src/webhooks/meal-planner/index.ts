import { Context } from "hono";
import { getWebhookEventType, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent() {}

export async function handle(c: Context) {
  console.log("Received webhook event");

  const isVerified = await verifyWebhook(c);
  if (!isVerified) {
    return c.text("Unauthorized", 401);
  }

  const webhookEventType = getWebhookEventType(c);

  c.executionCtx.waitUntil(
    (async () => {
      try {
        switch (webhookEventType) {
          case "populate":
            await handlePopulateWebhookEvent();
            break;
          default:
            console.log("Unknown event type", webhookEventType);
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
