type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /(key|secret|token|password|passwd|cookie|authorization|credential)/i;

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 400) {
    return `${value.slice(0, 400)}…[truncated]`;
  }
  return value;
}

function sanitize(fields: Fields): Fields {
  const output: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(value);
  }
  return output;
}

function emit(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...sanitize(fields ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Structured single-line logs. Any field whose name looks secret-shaped is redacted. */
export const logger = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
