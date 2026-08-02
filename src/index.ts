import { Hono } from "hono";
import type { ExecutionContext } from "hono";
import type { ForwardableEmailMessage, ScheduledController, D1Database } from "@cloudflare/workers-types";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";
import { email, testAiExtraction } from "./email";
import { createPosthogClient } from "./posthog";
import { createLogger } from "./lib/logger";
import { buildOtlpPayload, sendOtlpLog, type OtlpLogLevel } from "./lib/otlp-logs";

type Env = {
  AI: { run: (model: string, input: any) => Promise<any> };
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  NOTION_API_KEY?: string;
  DB?: D1Database;
};

function captureError(err: unknown, env: Env, ctx: ExecutionContext, source: string, service: string, extra?: Record<string, unknown>) {
  createLogger(service).error({ severity: "fatal", source, error: String(err), ...extra });
  const posthog = createPosthogClient(env);
  if (posthog) {
    posthog.captureException(err, "system", { source, ...extra });
    ctx.waitUntil(posthog.shutdown());
  }
}

const app = new Hono<{ Bindings: Env }>();

const testLog = createLogger("test");

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", handle);

app.get("/api/v1/test/ai", async (c) => {
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  const result = await testAiExtraction(c.env, waitUntil);
  return c.json(result);
});

app.get("/api/v1/test/logs", async (c) => {
  testLog.log({ severity: "info", message: "test log at info level" });
  testLog.info({ severity: "info", tag: "test" });
  testLog.warn({ severity: "warn", message: "test warn", tag: "test" });
  testLog.error({ severity: "error", message: "test error", tag: "test" });
  throw new Error("test-error-for-posthog-capture");
});

app.get("/api/v1/test/otlp", async (c) => {
  const host = (c.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const levels: OtlpLogLevel[] = ["debug", "info", "warn", "error"];
  const results = [];
  for (const level of levels) {
    const result = await sendOtlpLog(c.env, "otlp-test", level, {
      message: "hello from otlp test route",
      tag: "otlp-test",
    });
    results.push({ level, ...result });
  }
  return c.json({
    endpoint: `${host}/i/v1/logs`,
    samplePayload: buildOtlpPayload("otlp-test", "info", { message: "sample", tag: "otlp-test" }),
    results,
  });
});

app.onError(async (err, c) => {
  captureError(err, c.env, c.executionCtx, "fetch_handler", "api", { path: c.req.path });
  return c.json({ error: "Internal error" }, 500);
});

async function wrapFetch(request: Request, env: Env, ctx: ExecutionContext) {
  try {
    return await app.fetch(request, env, ctx);
  } catch (err) {
    captureError(err, env, ctx, "fetch_entry", "api");
    return new Response("Internal error", { status: 500 });
  }
}

async function wrapScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
  try {
    await scheduled(event, env as any, ctx as any);
  } catch (err) {
    captureError(err, env, ctx, "scheduled", "cron");
  }
}

async function wrapEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
  try {
    await email(message, env as any, ctx as any);
  } catch (err) {
    captureError(err, env, ctx, "email_entry", "email");
  }
}

export default {
  fetch: wrapFetch,
  scheduled: wrapScheduled,
  email: wrapEmail,
};
