type OtelAttributeValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OtelAttributeValue[] } }
  | { bytesValue: string };

type OtelAttribute = { key: string; value: OtelAttributeValue };

type OtelLogRecord = {
  timeUnixNano: string;
  observedTimeUnixNano?: string;
  severityNumber: number;
  severityText: string;
  body?: { stringValue: string };
  attributes?: OtelAttribute[];
};

type OtelScopeLog = {
  scope: { name: string };
  logRecords: OtelLogRecord[];
};

type OtelResourceLog = {
  resource: { attributes: OtelAttribute[] };
  scopeLogs: OtelScopeLog[];
};

type OtelPayload = { resourceLogs: OtelResourceLog[] };

const SEVERITY: Record<string, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

function encodeValue(v: unknown): OtelAttributeValue {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { intValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === "boolean") return { boolValue: v };
  if (v instanceof Uint8Array) return { bytesValue: btoa(String.fromCharCode(...v)) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { stringValue: String(v) };
}

function encodeAttributes(attrs?: Record<string, unknown>): OtelAttribute[] | undefined {
  if (!attrs || Object.keys(attrs).length === 0) return undefined;
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: encodeValue(value),
  }));
}

export class OtelLogger {
  private host: string;
  private apiKey: string;
  private logs: OtelLogRecord[] = [];
  private flushed = false;

  constructor(opts: { host: string; apiKey: string }) {
    this.host = opts.host;
    this.apiKey = opts.apiKey;
  }

  private emit(
    severityText: string,
    body: string,
    attributes?: Record<string, unknown>,
  ) {
    const severityNumber = SEVERITY[severityText] ?? 9;
    const now = BigInt(Date.now()) * BigInt(1_000_000);
    const timeUnixNano = now.toString();
    this.logs.push({
      timeUnixNano,
      observedTimeUnixNano: timeUnixNano,
      severityNumber,
      severityText,
      body: body ? { stringValue: body } : undefined,
      attributes: encodeAttributes(attributes),
    });
  }

  trace(body: string, attributes?: Record<string, unknown>) {
    this.emit("trace", body, attributes);
  }
  debug(body: string, attributes?: Record<string, unknown>) {
    this.emit("debug", body, attributes);
  }
  info(body: string, attributes?: Record<string, unknown>) {
    this.emit("info", body, attributes);
  }
  warn(body: string, attributes?: Record<string, unknown>) {
    this.emit("warn", body, attributes);
  }
  error(body: string, attributes?: Record<string, unknown>) {
    this.emit("error", body, attributes);
  }

  private buildPayload(): OtelPayload {
    return {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "notion-scripts" } },
              { key: "service.version", value: { stringValue: "1.0.0" } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: "notion-scripts" },
              logRecords: this.logs,
            },
          ],
        },
      ],
    };
  }

  async flush(): Promise<void> {
    if (this.flushed || this.logs.length === 0) return;
    this.flushed = true;
    const payload = this.buildPayload();
    const url = `${this.host}/i/v1/logs`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`[otel] Failed to send logs: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error("[otel] Failed to send logs:", err);
    }
  }
}

export function createOtelLogger(env: {
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
}): OtelLogger | null {
  if (!env.POSTHOG_API_KEY) return null;
  return new OtelLogger({
    host: env.POSTHOG_HOST || "https://us.i.posthog.com",
    apiKey: env.POSTHOG_API_KEY,
  });
}
