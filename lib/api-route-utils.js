export function readJsonObjectBody(req) {
  const body = req?.body;

  if (body == null || body === "") {
    return { ok: true, body: {} };
  }

  if (typeof body === "string") {
    try {
      const parsedBody = JSON.parse(body);

      if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
        return { ok: true, body: parsedBody };
      }

      return {
        ok: false,
        error: "Request body must be a JSON object.",
      };
    } catch {
      return {
        ok: false,
        error: "Request body must be valid JSON.",
      };
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return { ok: true, body };
  }

  return {
    ok: false,
    error: "Request body must be a JSON object.",
  };
}

export function mergeWarnings(...warnings) {
  return [...new Set(
    warnings
      .map(warning => String(warning || "").trim())
      .filter(Boolean),
  )].join(" ");
}
