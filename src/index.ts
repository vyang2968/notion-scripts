import { Hono } from "hono";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";
import { email, testAiExtraction } from "./email";

const app = new Hono();

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", handle);

app.get("/api/v1/test/ai", async (c) => {
  const result = await testAiExtraction(c.env);
  return c.json(result);
});

export default {
  fetch: app.fetch,
  scheduled,
  email,
};
