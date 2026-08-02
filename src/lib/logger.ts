import { env, waitUntil } from "cloudflare:workers";
import { sendOtlpLog, type OtlpLogLevel } from "./otlp-logs";

export type Logger = {
  log: (fields: Record<string, unknown>) => void;
  info: (fields: Record<string, unknown>) => void;
  warn: (fields: Record<string, unknown>) => void;
  error: (fields: Record<string, unknown>) => void;
  debug: (fields: Record<string, unknown>) => void;
};

const logEnv = env as unknown as { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string };

const METHOD_LEVEL: Record<string, OtlpLogLevel> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

function normalizeLevel(value: unknown): OtlpLogLevel | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.toLowerCase()) {
    case "trace":
      return "trace";
    case "debug":
    case "dbug":
      return "debug";
    case "info":
    case "information":
    case "informational":
    case "log":
      return "info";
    case "warn":
    case "warning":
      return "warn";
    case "error":
    case "err":
      return "error";
    case "fatal":
    case "critical":
    case "crit":
      return "fatal";
    default:
      return undefined;
  }
}

export function createLogger(service: string): Logger {
  const emit = (method: "log" | "info" | "warn" | "error" | "debug", fields: Record<string, unknown>) => {
    const line = { service, ...fields };
    switch (method) {
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
      case "debug":
        console.debug(line);
        break;
      default:
        console.log(line);
    }
    const level = normalizeLevel(fields.severity) ?? METHOD_LEVEL[method];
    waitUntil(sendOtlpLog(logEnv, service, level, fields).catch(() => {}));
  };

  return {
    log: (fields) => emit("log", fields),
    info: (fields) => emit("info", fields),
    warn: (fields) => emit("warn", fields),
    error: (fields) => emit("error", fields),
    debug: (fields) => emit("debug", fields),
  };
}
