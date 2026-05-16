import { Hono } from "hono";
import { getNotion } from "./lib/notion";
import { HEALTHCHECK_PARENT_BLOCK_ID } from "./webhooks/meal-planner/constants";
import { BlockObjectResponse } from "@notionhq/client";
import { formatInTimeZone } from "date-fns-tz";
import { scheduled } from "./cron";

const app = new Hono();

app.get("/", async (c) => {
});

app.post("/api/v1/meal-planner", async (c) => {});

export default {
  fetch: app.fetch,
  scheduled,
};
