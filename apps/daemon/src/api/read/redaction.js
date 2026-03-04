const SECRET_KEY_PATTERN = /(token|secret)/i;

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function redactSecrets(value, keyPath = "") {
  if (Array.isArray(value)) {
    return value.map((entry, index) => redactSecrets(entry, `${keyPath}[${index}]`));
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const childPath = keyPath.length > 0 ? `${keyPath}.${key}` : key;
    if (SECRET_KEY_PATTERN.test(key)) {
      next[key] = "[REDACTED]";
      continue;
    }

    next[key] = redactSecrets(entry, childPath);
  }

  return next;
}

export function parseAndRedactJson(jsonValue) {
  if (typeof jsonValue !== "string" || jsonValue.length === 0) {
    return null;
  }

  try {
    return redactSecrets(JSON.parse(jsonValue));
  } catch {
    return null;
  }
}
