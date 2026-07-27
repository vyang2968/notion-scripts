import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import type { ForwardableEmailMessage, ScheduledController } from "@cloudflare/workers-types";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";
import { email, testAiExtraction } from "./email";
import { createPosthogClient } from "./posthog";
import { createOtelLogger, OtelLogger } from "./otel-logger";

type Env = {
  AI: { run: (model: string, input: any) => Promise<any> };
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  NOTION_API_KEY?: string;
};

function captureError(
  err: unknown,
  env: Env,
  ctx: ExecutionContext,
  source: string,
  extra?: Record<string, unknown>,
  logger?: OtelLogger | null,
) {
  logger?.error(`[fatal] ${source}`, { error: String(err), ...extra });
  const posthog = createPosthogClient(env);
  if (posthog) {
    posthog.captureException(err, "system", { source, ...extra });
    ctx.waitUntil(posthog.shutdown());
  }
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", async (c) => {
  const logger = createOtelLogger(c.env, "meal-planner");
  try {
    return await handle(c, logger);
  } finally {
    if (logger) c.executionCtx.waitUntil(logger.flush());
  }
});

app.get("/api/v1/test/ai", async (c) => {
  const logger = createOtelLogger(c.env, "test");
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  const result = await testAiExtraction(c.env, waitUntil);
  logger?.info("test ai endpoint", { result: result.success });
  if (logger) c.executionCtx.waitUntil(logger.flush());
  return c.json(result);
});

app.get("/api/v1/test/logs", async (c) => {
  const logger = createOtelLogger(c.env, "test");
  logger?.info("test log at info level");
  logger?.info("test info with attrs", { tag: "test", severity: "info" });
  logger?.warn("test warn", { tag: "test", severity: "warn" });
  logger?.error("test error", { tag: "test", severity: "error" });
  if (logger) c.executionCtx.waitUntil(logger.flush());
  throw new Error("test-error-for-posthog-capture");
});

app.onError(async (err, c) => {
  const logger = createOtelLogger(c.env, "notion-scripts");
  captureError(err, c.env, c.executionCtx, "fetch_handler", { path: c.req.path }, logger);
  if (logger) c.executionCtx.waitUntil(logger.flush());
  return c.json({ error: "Internal error" }, 500);
});

async function wrapFetch(request: Request, env: Env, ctx: ExecutionContext) {
  const logger = createOtelLogger(env, "notion-scripts");
  try {
    return await app.fetch(request, env, ctx);
  } catch (err) {
    captureError(err, env, ctx, "fetch_entry", undefined, logger);
    if (logger) ctx.waitUntil(logger.flush());
    return new Response("Internal error", { status: 500 });
  }
}

async function wrapScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  const logger = createOtelLogger(env, "cron");
  try {
    await scheduled(event, env as any, ctx as any, logger);
  } catch (err) {
    captureError(err, env, ctx, "scheduled", undefined, logger);
  } finally {
    if (logger) ctx.waitUntil(logger.flush());
  }
}

async function wrapEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
  const logger = createOtelLogger(env, "email");
  try {
    await email(message, env as any, ctx as any, logger);
  } catch (err) {
    captureError(err, env, ctx, "email_entry", undefined, logger);
  }
}

export default {
  fetch: wrapFetch,
  scheduled: wrapScheduled,
  email: wrapEmail,
};
