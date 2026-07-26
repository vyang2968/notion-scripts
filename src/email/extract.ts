type JobApplication = {
  type: "job_application";
  company: string;
  position: string;
  status: "applied" | "online assessment" | "phone screen" | "interviewing" | "offer" | "accepted" | "rejected";
  applicationId: string | undefined;
  contactName: string | undefined;
  contactEmail: string | undefined;
  applicationDate: string;
};

type NotJobRelated = {
  type: "not_job_related";
};

type FollowUp = {
  type: "follow_up";
  company: string;
  position: string;
  status: "applied" | "online assessment" | "phone screen" | "interviewing" | "offer" | "accepted" | "rejected";
  contactName: string | undefined;
  contactEmail: string | undefined;
  applicationDate: string;
};

export type ExtractionResult = JobApplication | NotJobRelated | FollowUp;

export const SYSTEM_PROMPT = `You are parsing job application emails. Determine if the email is related to a job application, then extract structured data.

For a NEW job application email (application confirmation, acknowledgment):
- type: "job_application"
- status: infer the current stage from the email

For a FOLLOW-UP email (recruiter reaching out, interview invitation, status update, rejection):
- type: "follow_up"
- status: infer the updated stage

For anything NOT job-related (newsletters, receipts, spam, etc.):
- type: "not_job_related"

Rules:
- company: the company name
- position: the job title/role
- applicationId: any reference/ID number if present, otherwise undefined
- contactName: sender's name if a person (not a noreply), otherwise undefined
- contactEmail: sender's email if a person, otherwise undefined
- applicationDate: today's date in YYYY-MM-DD format
- status must be exactly one of: "applied", "online assessment", "phone screen", "interviewing", "offer", "accepted", "rejected"

Return ONLY valid JSON, no other text.`;

export function buildPrompt(emailText: string, emailSubject: string, emailFrom: string): string {
  return `Email from: ${emailFrom}
Subject: ${emailSubject}

Body:
${emailText?.slice(0, 3000) || "(no text content)"}

Return JSON:`;
}

export function parseResponse(raw: string): ExtractionResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}
