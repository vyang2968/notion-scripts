import { Client } from "@notionhq/client";
import type { Context } from "hono";
import { env as getHonoEnv } from "hono/adapter";

export type EnvBindings = {
  NOTION_API_KEY: string;
};

let notion: Client;

export function getNotion(source: Context | EnvBindings) {
  const bindings =
    source && typeof source === "object" && "req" in source
      ? getHonoEnv<EnvBindings>(source)
      : (source as EnvBindings);

  const apiKey = bindings?.NOTION_API_KEY;

  if (!apiKey) {
    throw new Error("NOTION_API_KEY is not set in the environment variables");
  }

  if (!notion) {
    notion = new Client({ auth: apiKey });
  }

  return notion;
}
