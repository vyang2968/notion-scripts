import type { Client } from "@notionhq/client";
import type { JobApplication, FollowUp, Status } from "../email/extract";

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

  return {
    "company": { title: [{ text: { content: company } }] },
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
      { property: "company" as const, title: { equals: company } },
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

export async function syncJobApplication(notion: Client, data: JobApplication | FollowUp) {
  const { company, position } = data;

  const existing = await findExisting(notion, data);
  const properties = buildProperties(data);

  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties });
    console.log("[notion] Updated page:", existing.id, `${company} - ${position}`);
  } else {
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties,
    });
    console.log("[notion] Created page for:", `${company} - ${position}`);
  }
}
