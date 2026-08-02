import { createLogger } from "./logger";

const log = createLogger("ai");

export const SYSTEM_PROMPT_NAME = "job-applications-ai-system-prompt";

export const SYSTEM_PROMPT_FALLBACK = `{{date_ref}}

You are parsing job application emails. Determine if the email is related to a job application, then extract structured data.

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
- position: the job title/role. Use "Unknown" if the job title cannot be determined.
- applicationId: any reference/ID number if present, otherwise null
- applicationDate: the date from the "Sent" line in the email body, in YYYY-MM-DD format
- contactName: only populate if a real person sent this (e.g. recruiter, hiring manager). Set to null for automated senders like noreply@, jobs@, careers@, etc.
- contactEmail: the sender's email if a real person, otherwise null
- oaDeadlineDate: the date the online assessment is due, in YYYY-MM-DD format. Use an explicit date from the email, or compute it from phrases like "due within X days/weeks" using the date provided above. If the email involves an online assessment but no deadline is mentioned, set it to one week after the date provided above. If the email involves no online assessment, set it to null.
- interviewDate: the date of the next scheduled interview round, in YYYY-MM-DD format. Only populate if the email mentions a scheduled interview; otherwise null.
- status must be exactly one of: "applied", "online assessment", "phone screen", "interviewing", "offer", "accepted", "rejected"

Consistency rules (so follow-up emails match the original application):
- For follow-ups, return the same company and position used for the original application.
- company: use the full, canonical company name (e.g. "Acme" → "Acme Corp"), not abbreviations.
- position: use the full job title (e.g. "SWE" or "Engineer" → "Software Engineer"), and reuse the same title wording for the same role across emails.
- applicationId: only populate with a real reference/ID number found in the email, otherwise null.

Return ONLY valid JSON matching this schema, no other text:
{{json_schema}}`;

export type PromptEnv = {
  POSTHOG_HOST?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_PERSONAL_API_KEY?: string;
};

type CacheEntry = {
  fetchedAt: number;
  prompt: string;
  name: string;
  version: number;
};

const cache = new Map<string, CacheEntry>();

function toAppHost(host?: string) {
  return (host || "https://us.posthog.com").replace(".i.posthog.com", ".posthog.com");
}

export function compilePrompt(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{([\w.-]+)\}\}/g, (match, variableName: string) => {
    if (variableName in variables) {
      return String(variables[variableName]);
    }
    return match;
  });
}

export async function fetchSystemPrompt(env: PromptEnv): Promise<string> {
  const ttlMs = 5 * 60 * 1000;
  const cached = cache.get(SYSTEM_PROMPT_NAME);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.prompt;
  }

  const projectApiKey = env.POSTHOG_API_KEY;
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY;

  if (projectApiKey && personalApiKey) {
    try {
      const url = `${toAppHost(env.POSTHOG_HOST)}/api/environments/@current/llm_prompts/name/${encodeURIComponent(SYSTEM_PROMPT_NAME)}/?token=${encodeURIComponent(projectApiKey)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${personalApiKey}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { prompt?: string; name?: string; version?: number };
      if (typeof data.prompt !== "string") {
        throw new Error("invalid response");
      }
      cache.set(SYSTEM_PROMPT_NAME, {
        fetchedAt: Date.now(),
        prompt: data.prompt,
        name: data.name ?? SYSTEM_PROMPT_NAME,
        version: data.version ?? 0,
      });
      log.log({ component: "ai", event: "prompt_loaded", prompt: SYSTEM_PROMPT_NAME, version: data.version });
      return data.prompt;
    } catch (err) {
      log.error({ component: "ai", event: "prompt_fetch_failed", prompt: SYSTEM_PROMPT_NAME, error: String(err) });
      if (cached) return cached.prompt;
    }
  }

  return SYSTEM_PROMPT_FALLBACK;}
