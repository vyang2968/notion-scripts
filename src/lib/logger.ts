export type Logger = {
  log: (fields: Record<string, unknown>) => void;
  info: (fields: Record<string, unknown>) => void;
  warn: (fields: Record<string, unknown>) => void;
  error: (fields: Record<string, unknown>) => void;
  debug: (fields: Record<string, unknown>) => void;
};

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
  };

  return {
    log: (fields) => emit("log", fields),
    info: (fields) => emit("info", fields),
    warn: (fields) => emit("warn", fields),
    error: (fields) => emit("error", fields),
    debug: (fields) => emit("debug", fields),
  };
}
