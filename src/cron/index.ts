import type {
  ScheduledController,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { reportHealth } from "./handlers";

export async function scheduled(
  event: ScheduledController,
  env: { NOTION_API_KEY: string },
  ctx: ExecutionContext,
) {
  console.log(`Cron triggered at: ${new Date().toISOString()}`);

  switch (event.cron) {
    case "*/5 * * * *":
      await reportHealth(env);
      return ;
    case "":
      return ;
    default:
      return ;
  }
}
