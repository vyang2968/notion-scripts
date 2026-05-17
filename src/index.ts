import { Hono } from "hono";
import { scheduled } from "./cron";

const app = new Hono();

app.get("/", async (c) => {
});

app.post("/api/v1/meal-planner", async (c) => {});

export default {
  fetch: app.fetch,
  scheduled,
};
