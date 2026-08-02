export type OtlpLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type OtlpEnv = {
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
};

const SEVERITY: Record<OtlpLogLevel, { number: number; text: string }> = {
  trace: { number: 1, text: "trace" },
  debug: { number: 5, text: "debug" },
  info: { number: 9, text: "info" },
  warn: { number: 13, text: "warn" },
  error: { number: 17, text: "error" },
  fatal: { number: 21, text: "fatal" },
};

function toAttributeValue(value: unknown): { stringValue: string } {
  return { stringValue: typeof value === "string" ? value : JSON.stringify(value) };
}

export function buildOtlpPayload(service: string, level: OtlpLogLevel, fields: Record<string, unknown>) {
  const line = { service, ...fields };
  const severity = SEVERITY[level];
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: service } }],
        },
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: (BigInt(Date.now()) * 1000000n).toString(),
                severityNumber: severity.number,
                severityText: severity.text,
                body: { stringValue: JSON.stringify(line) },
                attributes: Object.entries(line).map(([key, value]) => ({
                  key,
                  value: toAttributeValue(value),
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

export async function sendOtlpLog(
  env: OtlpEnv,
  service: string,
  level: OtlpLogLevel,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  if (!env.POSTHOG_API_KEY) {
    return { ok: false, status: 0, text: "POSTHOG_API_KEY not set" };
  }
  const host = (env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const res = await fetch(`${host}/i/v1/logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
    },
    body: JSON.stringify(buildOtlpPayload(service, level, fields)),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
