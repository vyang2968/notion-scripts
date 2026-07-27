import { Context } from "hono";
import { createPosthogClient } from "../../posthog";
import { getWebhookEventType, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent() {}

export async function handle(c: Context) {
  const posthog = createPosthogClient(c.env);

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
        console.error("Failed to process Notion automation background event:", error);
        posthog?.captureException(error, "webhook", { source: "webhook_background" });
      }
    })(),
  );

  if (posthog) c.executionCtx.waitUntil(posthog.shutdown());

  return c.json({ success: true }, 200);
}
