import { Context } from "hono";
import { createPosthogClient } from "../../posthog";
import { OtelLogger } from "../../otel-logger";
import { getWebhookEventType, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent() {}

export async function handle(c: Context, logger?: OtelLogger | null) {
  const posthog = createPosthogClient(c.env);

  logger?.info("Received webhook event");

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
            logger?.warn("Unknown event type", { eventType: webhookEventType });
        }
      } catch (error) {
        logger?.error("Failed to process Notion automation background event", { error: String(error) });
        posthog?.captureException(error, "webhook", { source: "webhook_background" });
      }
    })(),
  );

  if (logger) c.executionCtx.waitUntil(logger.flush());
  if (posthog) c.executionCtx.waitUntil(posthog.shutdown());

  return c.json({ success: true }, 200);
}
