import { readJsonObjectBody } from "../../lib/api-route-utils";
import { createCurrentMemberId, normalizeCircle, syncCircleVoiceSession } from "../../lib/sharepass-circles";
import {
  isAdminEmail,
  deleteUserByEmail,
  readCircles,
  readUsers,
  replaceCircles,
  resolveStore,
  upsertUser,
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
    createdAt: cleanString(sessionProfile.createdAt),
  };
}

function hasAdminAccess(email) {
  return isAdminEmail(email);
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return sendMethodNotAllowed(res);
  }

  const { db, storage, warning } = await resolveStore();

  try {
    if (req.method === "GET") {
      const viewerEmail = cleanString(req.query.viewerEmail).toLowerCase();
      if (!hasAdminAccess(viewerEmail)) {
        return res.status(403).json({ error: "Only admins can view user records." });
      }

      const users = await readUsers(db);

      return res.status(200).json({
        users,
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
      const sessionProfile = normalizeSessionProfile(body.sessionProfile);

      if (!sessionProfile.email) {
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "guest-session",
          storage,
          warning,
        });
      }

      const user = {
        id: `user-${sessionProfile.email.replace(/[^a-z0-9]+/g, "-")}`,
        email: sessionProfile.email,
        username: sessionProfile.username || sessionProfile.displayName || sessionProfile.email.split("@")[0],
        displayName: sessionProfile.displayName || sessionProfile.username || sessionProfile.email.split("@")[0],
        entryMethod: sessionProfile.entryMethod || "email",
        role: hasAdminAccess(sessionProfile.email) ? "super-admin" : "member",
        currentMood: cleanString(body.currentMood) || "hopeful",
        joinedCircleIds: Array.isArray(body.joinedCircleIds) ? body.joinedCircleIds.filter(Boolean) : [],
        createdAt: sessionProfile.createdAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      await upsertUser(db, user);

      return res.status(200).json({
        user,
        storage,
        warning,
      });
    }

    const viewerEmail = cleanString(body.viewerEmail).toLowerCase();
    const targetEmail = cleanString(body.targetEmail).toLowerCase();
    if (!hasAdminAccess(viewerEmail)) {
      return res.status(403).json({ error: "Only admins can delete users." });
    }

    if (!targetEmail) {
      return res.status(400).json({ error: "Choose a user email to delete." });
    }

    await deleteUserByEmail(db, targetEmail);

    const targetMemberId = createCurrentMemberId({ email: targetEmail });
    const circles = await readCircles(db);
    const nextCircles = circles.map(circle => syncCircleVoiceSession(normalizeCircle({
      ...circle,
      members: circle.members.filter(member => member.email !== targetEmail && member.id !== targetMemberId),
      speakers: circle.speakers.filter(memberId => memberId !== targetMemberId),
      requestQueue: circle.requestQueue.filter(memberId => memberId !== targetMemberId),
      unreadCounts: Object.fromEntries(
        Object.entries(circle.unreadCounts || {}).filter(([memberId]) => memberId !== targetMemberId),
      ),
    })));

    await replaceCircles(db, nextCircles);

    return res.status(200).json({
      ok: true,
      storage,
      warning,
    });
  } catch (error) {
    console.error("User route failed", error);
    return res.status(500).json({ error: "User data could not be updated right now." });
  }
}
