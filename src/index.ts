import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import type { ForwardableEmailMessage, ScheduledController } from "@cloudflare/workers-types";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";
import { email, testAiExtraction } from "./email";
import { createPosthogClient } from "./posthog";

type Env = {
  AI: { run: (model: string, input: any) => Promise<any> };
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  NOTION_API_KEY?: string;
};

function captureError(err: unknown, env: Env, ctx: ExecutionContext, source: string, extra?: Record<string, unknown>) {
  console.error(`[fatal] ${source}:`, err);
  const posthog = createPosthogClient(env);
  if (posthog) {
    posthog.captureException(err, "system", { source, ...extra });
    ctx.waitUntil(posthog.shutdown());
  }
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", handle);

app.get("/api/v1/test/ai", async (c) => {
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  const result = await testAiExtraction(c.env, waitUntil);
  return c.json(result);
});

app.get("/api/v1/test/logs", async (c) => {
  console.log("test log at info level");
  console.info("test info with attrs", { tag: "test", severity: "info" });
  console.warn("test warn", { tag: "test", severity: "warn" });
  console.error("test error", { tag: "test", severity: "error" });
  throw new Error("test-error-for-posthog-capture");
});

app.onError(async (err, c) => {
  captureError(err, c.env, c.executionCtx, "fetch_handler", { path: c.req.path });
  return c.json({ error: "Internal error" }, 500);
});

async function wrapFetch(request: Request, env: Env, ctx: ExecutionContext) {
  try {
    return await app.fetch(request, env, ctx);
  } catch (err) {
    captureError(err, env, ctx, "fetch_entry");
    return new Response("Internal error", { status: 500 });
  }
}

async function wrapScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  try {
    await scheduled(event, env as any, ctx as any);
  } catch (err) {
    captureError(err, env, ctx, "scheduled");
  }
}

async function wrapEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
  try {
    await email(message, env as any, ctx as any);
  } catch (err) {
    captureError(err, env, ctx, "email_entry");
  }
}

export default {
  fetch: wrapFetch,
  scheduled: wrapScheduled,
  email: wrapEmail,
};
