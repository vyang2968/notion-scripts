import type { Client } from "@notionhq/client";
import type { JobApplication, FollowUp, Status } from "../email/extract";
import { createLogger } from "./logger";

const log = createLogger("email");

const DATABASE_ID = "45228394-435c-83c1-867e-01e4061b8120";
const DATA_SOURCE_ID = "a4328394-435c-8361-b84d-8775c801c09d";

const STATUS_MAP: Record<Status, string> = {
  "applied": "applied",
  "online assessment": "online assessment",
  "phone screen": "phone screen",
  "interviewing": "interview",
  "offer": "offer",
  "accepted": "accepted",
  "rejected": "rejected",
};

function buildProperties(data: JobApplication | FollowUp) {
  const { company, position, status, applicationDate, contactName, contactEmail, from } = data;
  const applicationId = data.type === "job_application" ? data.applicationId : null;
  const title = applicationId
    ? `${company} - ${position} - ${applicationId}`
    : `${company} - ${position}`;

  return {
    "title": { title: [{ text: { content: title } }] },
    "company": { rich_text: [{ text: { content: company } }] },
    "position": { rich_text: [{ text: { content: position } }] },
    "status": { multi_select: [{ name: STATUS_MAP[status] }] },
    "application date": { date: { start: applicationDate } },
    "from email": { email: from },
    ...(applicationId ? { "application id": { rich_text: [{ text: { content: applicationId } }] } } : {}),
    ...(contactName ? { "contact name": { rich_text: [{ text: { content: contactName } }] } } : {}),
    ...(contactEmail ? { "contact email": { email: contactEmail } } : {}),
  };
}

function buildCompanyPositionFilter(company: string, position: string) {
  return {
    and: [
      { property: "company" as const, rich_text: { equals: company } },
      { property: "position" as const, rich_text: { equals: position } },
    ],
  };
}

async function findExisting(notion: Client, data: JobApplication | FollowUp) {
  const applicationId = data.type === "job_application" ? data.applicationId : null;

  if (applicationId) {
    const byId = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter: { property: "application id" as const, rich_text: { equals: applicationId } },
    });
    if (byId.results.length > 0) return byId.results[0];
  }

  const byCompany = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: buildCompanyPositionFilter(data.company, data.position),
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });

  return byCompany.results[0] ?? null;
}

const MAX_EMAIL_BODY_LENGTH = 2000;
const TRUNCATION_SUFFIX = "\n\n— truncated —";

function truncateEmailBody(emailBody: string) {
  const chars = Array.from(emailBody);
  const maxBody = MAX_EMAIL_BODY_LENGTH - Array.from(TRUNCATION_SUFFIX).length;
  if (chars.length <= maxBody) return emailBody;
  return chars.slice(0, maxBody).join("") + TRUNCATION_SUFFIX;
}

function buildCorrespondenceBlocks(emailBody: string, emailSubject: string, date: string) {
  const body = truncateEmailBody(emailBody);

  return [
    {
      toggle: {
        rich_text: [{ type: "text" as const, text: { content: `${date} - ${emailSubject}` } }],
        children: [
          {
            quote: {
              rich_text: [{ type: "text" as const, text: { content: body } }],
            },
            type: "quote" as const,
            object: "block" as const,
          },
        ],
      },
      type: "toggle" as const,
      object: "block" as const,
    },
  ];
}

export async function syncJobApplication(
  notion: Client,
  data: JobApplication | FollowUp,
  emailBody: string,
  emailSubject: string,
) {
  const { company, position, applicationDate } = data;

  const existing = await findExisting(notion, data);
  const properties = buildProperties(data);
  const blocks = buildCorrespondenceBlocks(emailBody, emailSubject, applicationDate);

  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties });
    await notion.blocks.children.append({ block_id: existing.id, children: blocks, position: { type: "start" } });
    log.log({ component: "notion", event: "page_updated", pageId: existing.id, title: `${company} - ${position}` });
  } else {
    const created = await notion.pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
      properties,
    });
    await notion.blocks.children.append({ block_id: created.id, children: blocks, position: { type: "start" } });
    log.log({ component: "notion", event: "page_created", title: `${company} - ${position}` });
  }
}
