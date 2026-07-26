import { Context } from "hono";
import { createPosthogClient } from "../../posthog";
import { initLoggerProvider, getLogger } from "../../otel-logger";
import { getWebhookEventType, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent() {}

export async function handle(c: Context) {
  const posthog = createPosthogClient(c.env);
  initLoggerProvider(c.env);
  const logger = getLogger();

  logger.emit({ severityText: "info", body: "Received webhook event", attributes: { tag: "webhook" } });
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
            logger.emit({ severityText: "warn", body: "Unknown event type", attributes: { tag: "webhook", type: webhookEventType } });
            console.log("Unknown event type", webhookEventType);
        }
      } catch (error) {
        logger.emit({ severityText: "error", body: "Failed to process background event", attributes: { tag: "webhook", error: String(error) } });
        console.error("Failed to process Notion automation background event:", error);
        posthog?.captureException(error, "webhook", { source: "webhook_background" });
      }
    })(),
  );

  if (posthog) c.executionCtx.waitUntil(posthog.shutdown());

  return c.json({ success: true }, 200);
}
