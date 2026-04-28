import crypto from "crypto";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeHost(value) {
  const host = cleanString(value).toLowerCase();

  if (!host || host.includes("/") || host.includes("@") || host.includes("..") || /\s/.test(host)) {
    return "";
  }

  return host;
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID
      && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function resolveRequestOrigin(req) {
  const forwardedProto = cleanString(req.headers["x-forwarded-proto"]);
  const host = sanitizeHost(req.headers["x-forwarded-host"] || req.headers.host);
  const explicitAppUrl = cleanString(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);

  if (explicitAppUrl) {
    return explicitAppUrl.replace(/\/+$/, "");
  }

  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : host.includes("localhost") ? "http" : "https";

  if (!host) {
    throw new Error("Request host is missing or invalid.");
  }

  return `${protocol}://${host}`;
}

export function buildGoogleRedirectUri(origin) {
  return `${origin}/auth/google/callback`;
}

export function createGoogleState() {
  return crypto.randomBytes(24).toString("hex");
}

export function buildGoogleAuthorizationUrl({ origin, state }) {
  const redirectUri = buildGoogleRedirectUri(origin);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    access_type: "offline",
    state,
  }).toString();

  return url.toString();
}

export async function exchangeGoogleCode({ code, origin }) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: buildGoogleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => null);

  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(tokenPayload?.error_description || "Google token exchange failed.");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  const userPayload = await userResponse.json().catch(() => null);

  if (!userResponse.ok || !userPayload?.email) {
    throw new Error("Google user information could not be loaded.");
  }

  return {
    email: cleanString(userPayload.email).toLowerCase(),
    displayName: cleanString(userPayload.name) || cleanString(userPayload.given_name) || "Google Member",
    avatarLabel: cleanString(userPayload.name).charAt(0).toUpperCase() || "G",
    picture: cleanString(userPayload.picture),
    emailVerified: Boolean(userPayload.email_verified),
  };
}
