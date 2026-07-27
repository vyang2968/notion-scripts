import { Context } from "hono";
import { createPosthogClient } from "../../posthog";
import { getWebhookEventType, verifyWebhook } from "./utils";

async function handlePopulateWebhookEvent() {}

export async function handle(c: Context) {
  const posthog = createPosthogClient(c.env);

  console.log({ service: "meal-planner", event: "webhook_received" });

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
            console.log({ service: "meal-planner", event: "unknown_event_type", type: webhookEventType });
        }
      } catch (error) {
        console.error({ service: "meal-planner", event: "background_event_failed", error: String(error) });
        posthog?.captureException(error, "webhook", { source: "webhook_background" });
      }
    })(),
  );

  if (posthog) c.executionCtx.waitUntil(posthog.shutdown());

  return c.json({ success: true }, 200);
}
