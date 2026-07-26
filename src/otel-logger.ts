import { logs } from "@opentelemetry/api-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

let _sdk: NodeSDK | null = null;
let _initialized = false;

export function initLoggerProvider(env: { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string }) {
  if (_initialized) return;
  _initialized = true;

  const apiKey = env.POSTHOG_API_KEY;
  if (!apiKey) return;

  const host = env.POSTHOG_HOST || "https://us.i.posthog.com";

  _sdk = new NodeSDK({
    resource: resourceFromAttributes({ "service.name": "notion-scripts" }),
    logRecordProcessor: new BatchLogRecordProcessor(
      // @ts-expect-error OTel SDK lib types expect { exporter } but PostHog docs pass exporter directly
      new OTLPLogExporter({
        url: `${host}/i/v1/logs`,
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ),
  });

  _sdk.start();
}

export function getLogger() {
  return logs.getLogger("notion-scripts");
}

export function flushLogs() {
  return _sdk?.shutdown() ?? Promise.resolve();
}
