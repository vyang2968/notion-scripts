import type {
  ScheduledController,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { initLoggerProvider, getLogger } from "../otel-logger";
import { reportHealth } from "./handlers";

export async function scheduled(
  event: ScheduledController,
  env: { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string; NOTION_API_KEY: string },
  ctx: ExecutionContext,
) {
  initLoggerProvider(env);
  const logger = getLogger();
  logger.emit({ severityText: "info", body: "Triggered", attributes: { tag: "cron", time: new Date().toISOString() } });
  console.log(`Cron triggered at: ${new Date().toISOString()}`);
  ctx.waitUntil(reportHealth(env));
}
