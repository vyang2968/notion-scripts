import { Hono } from "hono";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";
import { email, testAiExtraction } from "./email";

const app = new Hono();

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", handle);

app.get("/api/v1/test/ai", async (c) => {
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  const result = await testAiExtraction(c.env, waitUntil);
  return c.json(result);
});

export default {
  fetch: app.fetch,
  scheduled,
  email,
};
