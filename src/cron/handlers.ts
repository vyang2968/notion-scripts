import { Context } from "hono";
import { EnvBindings, getNotion } from "../lib/notion";
import { HEALTHCHECK_PARENT_BLOCK_ID } from "../webhooks/meal-planner/constants";
import { BlockObjectResponse } from "@notionhq/client";
import { formatInTimeZone } from "date-fns-tz";

export async function reportHealth(env: EnvBindings) {
  const notion = getNotion(env);
  const res = await notion.blocks.children.list({
    block_id: HEALTHCHECK_PARENT_BLOCK_ID,
  });

  const dividerIdx = res.results.findIndex(
    (block): block is BlockObjectResponse =>
      "type" in block && block.type === "divider",
  );
  if (dividerIdx === -1) throw new Error("divider not found");

  const [statusBlock, timeBlock] = res.results.slice(dividerIdx + 1);
  if (!statusBlock || !timeBlock)
    throw new Error("Missing healthcheck blocks after divider");

  const timestamp = formatInTimeZone(
    new Date(),
    "America/New_York",
    "MMM d, h:mm a",
  );

  await Promise.all([
    notion.blocks.update({
      block_id: statusBlock.id,
      paragraph: {
        rich_text: [
          { text: { content: "✅ " } },
          {
            text: { content: "ONLINE" },
            annotations: { bold: true, color: "green" },
          },
        ],
      },
    }),
    notion.blocks.update({
      block_id: timeBlock.id,
      paragraph: {
        rich_text: [
          { text: { content: timestamp }, annotations: { code: true } },
        ],
      },
    }),
  ]);
}
