import type {
  ScheduledController,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { reportHealth } from "./handlers";
import { OtelLogger } from "../otel-logger";

export async function scheduled(
  event: ScheduledController,
  env: { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string; NOTION_API_KEY: string },
  ctx: ExecutionContext,
  logger?: OtelLogger | null,
) {
  logger?.info("Cron triggered", { time: new Date().toISOString() });
  ctx.waitUntil(reportHealth(env));
}
