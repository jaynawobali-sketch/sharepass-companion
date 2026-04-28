import { readJsonObjectBody } from "../../lib/api-route-utils";
import { readAdminSessionEmailFromRequest } from "../../lib/sharepass-admin-session";
import {
  isAdminEmail,
  readFeedback,
  resolveStore,
  saveFeedback,
  updateFeedbackStatus,
} from "../../lib/sharepass-server-store";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionProfile(sessionProfile = {}) {
  return {
    entryMethod: cleanString(sessionProfile.entryMethod),
    username: cleanString(sessionProfile.username),
    displayName: cleanString(sessionProfile.displayName),
    email: cleanString(sessionProfile.email).toLowerCase(),
  };
}

function hasAdminAccess(email) {
  return isAdminEmail(email);
}

function resolveEffectiveAdminEmail(req, body = {}) {
  const cookieAdminEmail = readAdminSessionEmailFromRequest(req);

  if (cookieAdminEmail) {
    return cookieAdminEmail;
  }

  if (process.env.NODE_ENV !== "production") {
    return cleanString(body.viewerEmail || req.query?.viewerEmail).toLowerCase();
  }

  return "";
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    return sendMethodNotAllowed(res);
  }

  const { db, storage, warning } = await resolveStore();

  try {
    const queryAdminEmail = resolveEffectiveAdminEmail(req);

    if (req.method === "GET") {
      const viewerEmail = queryAdminEmail;
      if (!hasAdminAccess(viewerEmail)) {
        return res.status(403).json({ error: "Only admins can view feedback." });
      }

      const feedback = await readFeedback(db);

      return res.status(200).json({
        feedback,
        storage,
        warning,
      });
    }

    const parsedBody = readJsonObjectBody(req);

    if (!parsedBody.ok) {
      return res.status(400).json({ error: parsedBody.error });
    }

    const body = parsedBody.body;

    if (req.method === "POST") {
      const category = cleanString(body.category).toLowerCase();
      const subject = cleanString(body.subject);
      const message = cleanString(body.message);
      const sessionProfile = normalizeSessionProfile(body.sessionProfile);

      if (!["complaint", "praise", "bug", "moderation"].includes(category)) {
        return res.status(400).json({ error: "Choose a valid feedback category." });
      }

      if (!subject || !message) {
        return res.status(400).json({ error: "Add both a subject and a message." });
      }

      const createdAt = new Date().toISOString();
      const item = {
        id: `feedback-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        category,
        subject,
        message,
        status: "open",
        createdAt,
        updatedAt: createdAt,
        createdBy: {
          name: sessionProfile.displayName || sessionProfile.username || "Anonymous member",
          email: sessionProfile.email,
          entryMethod: sessionProfile.entryMethod || "guest",
        },
      };

      await saveFeedback(db, item);

      return res.status(201).json({
        item,
        storage,
        warning,
      });
    }

    const feedbackId = cleanString(body.feedbackId);
    const status = cleanString(body.status).toLowerCase();
    const viewerEmail = resolveEffectiveAdminEmail(req, body);
    if (!hasAdminAccess(viewerEmail)) {
      return res.status(403).json({ error: "Only admins can update feedback." });
    }

    if (!feedbackId || !["open", "reviewing", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Choose a valid feedback item and status." });
    }

    const item = await updateFeedbackStatus(db, feedbackId, status);

    return res.status(200).json({
      item,
      storage,
      warning,
    });
  } catch (error) {
    console.error("Feedback route failed", error);
    return res.status(500).json({ error: "Feedback could not be saved right now." });
  }
}
