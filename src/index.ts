import { Hono } from "hono";
import { scheduled } from "./cron";
import { handle } from "./webhooks/meal-planner";

const app = new Hono();

app.get("/", async (c) => {});

app.post("/api/v1/meal-planner/webhooks", handle);

export default {
  fetch: app.fetch,
  scheduled,
};
