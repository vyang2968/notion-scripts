import type {
  ScheduledController,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { reportHealth } from "./handlers";

export async function scheduled(
  event: ScheduledController,
  env: { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string; NOTION_API_KEY: string },
  ctx: ExecutionContext,
) {
  console.log({ service: "cron", event: "triggered", time: new Date().toISOString() });
  ctx.waitUntil(reportHealth(env));
}
