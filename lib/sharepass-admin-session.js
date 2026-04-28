import crypto from "crypto";

const COOKIE_NAME = "sharepass_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  return cleanString(process.env.SHAREPASS_SESSION_SECRET)
    || cleanString(process.env.GOOGLE_CLIENT_SECRET)
    || cleanString(process.env.MONGODB_URI);
}

function signPayload(payloadBase64) {
  const secret = getSessionSecret();

  if (!secret) {
    return "";
  }

  return crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");

  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function getAdminSessionCookieName() {
  return COOKIE_NAME;
}

export function createAdminSessionCookieValue(email) {
  const normalizedEmail = cleanString(email).toLowerCase();

  if (!normalizedEmail) {
    return "";
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    email: normalizedEmail,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);

  if (!signature) {
    return "";
  }

  return `${payloadBase64}.${signature}`;
}

export function readAdminSessionEmailFromRequest(req) {
  const cookieValue = cleanString(req?.cookies?.[COOKIE_NAME]);

  if (!cookieValue || !cookieValue.includes(".")) {
    return "";
  }

  const [payloadBase64, providedSignature] = cookieValue.split(".");
  const expectedSignature = signPayload(payloadBase64);

  if (!safeEqual(providedSignature, expectedSignature)) {
    return "";
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64));
    const email = cleanString(payload?.email).toLowerCase();
    const exp = Number(payload?.exp);

    if (!email || !Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      return "";
    }

    return email;
  } catch {
    return "";
  }
}

export function buildAdminSessionCookie({ email, secure }) {
  const value = createAdminSessionCookieValue(email);

  if (!value) {
    return "";
  }

  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function buildClearedAdminSessionCookie({ secure }) {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
