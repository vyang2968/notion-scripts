export type AiChatResponse = {
  response?: string;
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const STATUSES = [
  "applied", "online assessment", "phone screen", "interviewing", "offer", "accepted", "rejected",
] as const;

export type Status = typeof STATUSES[number];

export type JobApplication = {
  type: "job_application";
  from: string;
  company: string;
  position: string;
  status: Status;
  applicationId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  applicationDate: string;
};

export type FollowUp = {
  type: "follow_up";
  from: string;
  company: string;
  position: string;
  status: Status;
  contactName: string | null;
  contactEmail: string | null;
  applicationDate: string;
};

export type NotJobRelated = {
  type: "not_job_related";
};

export type ExtractionResult = JobApplication | FollowUp | NotJobRelated;

export const SYSTEM_PROMPT = `You are parsing job application emails. Determine if the email is related to a job application, then extract structured data.

For a NEW job application email (application confirmation, acknowledgment):
- type: "job_application"
- status: infer the current stage from the email

For a FOLLOW-UP email (recruiter reaching out, interview invitation, status update, rejection):
- type: "follow_up"
- status: infer the updated stage

For anything NOT job-related (newsletters, receipts, spam, etc.):
- type: "not_job_related"

Fields:
- from: the sender email address (always populate for job_application or follow_up)
- company: the company name
- position: the job title/role
- applicationId: any reference/ID number if present, otherwise null
- applicationDate: today's date in YYYY-MM-DD format
- contactName: only populate if a real person sent this (e.g. recruiter, hiring manager). Set to null for automated senders like noreply@, jobs@, careers@, etc.
- contactEmail: the sender's email if a real person, otherwise null
- status must be exactly one of: "applied", "online assessment", "phone screen", "interviewing", "offer", "accepted", "rejected"`;

export const JSON_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["job_application", "follow_up", "not_job_related"],
    },
    from: { type: "string" },
    company: { type: "string" },
    position: { type: "string" },
    status: {
      type: "string",
      enum: STATUSES,
    },
    applicationId: { type: ["string", "null"] },
    contactName: { type: ["string", "null"] },
    contactEmail: { type: ["string", "null"] },
    applicationDate: { type: "string" },
  },
  required: ["type"],
};

export function parseResponse(raw: unknown): ExtractionResult {
  if (typeof raw !== "string") {
    throw new Error(`Expected string response, got ${typeof raw}`);
  }
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (parsed.type === "not_job_related") return parsed;
  if (!parsed.company) throw new Error("Missing required field: company");
  return parsed;
}

export function buildPrompt(emailText: string, emailSubject: string, emailFrom: string) {
  return `Email from: ${emailFrom}
Subject: ${emailSubject}

Body:
${emailText?.slice(0, 3000) || "(no text content)"}`;
}
