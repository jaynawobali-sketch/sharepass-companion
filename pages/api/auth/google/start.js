import {
  buildGoogleAuthorizationUrl,
  createGoogleState,
  isGoogleOAuthConfigured,
  resolveRequestOrigin,
} from "../../../../lib/sharepass-google-auth";

function buildStateCookie(value, isSecure) {
  return [
    `sharepass_google_state=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    isSecure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!isGoogleOAuthConfigured()) {
    res.redirect("/?sheet=1&reason=google-oauth-unavailable");
    return;
  }

  let origin;
  try {
    origin = resolveRequestOrigin(req);
  } catch {
    res.redirect("/?sheet=1&reason=google-origin-invalid");
    return;
  }

  const state = createGoogleState();
  const isSecure = origin.startsWith("https://");

  res.setHeader("Set-Cookie", buildStateCookie(state, isSecure));
  res.redirect(buildGoogleAuthorizationUrl({ origin, state }));
}
