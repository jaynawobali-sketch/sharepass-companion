import { mergeWarnings, readJsonObjectBody } from "../../lib/api-route-utils";
import {
  bumpCircleUnreadCounts,
  createCircleFromDraft,
  createCircleMember,
  createCircleMessage,
  createCurrentMemberId,
  getCircleMember,
  markCircleRead,
  normalizeCircle,
  syncCircleVoiceSession,
} from "../../lib/sharepass-circles";
import {
  getAdminEmailList,
  isAdminEmail,
  readCircles,
  replaceCircles,
  resolveStore,
} from "../../lib/sharepass-server-store";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionProfile(sessionProfile = {}) {
  return {
    username: cleanString(sessionProfile.username),
    displayName: cleanString(sessionProfile.displayName),
    email: cleanString(sessionProfile.email).toLowerCase(),
  };
}

function resolveActorName(sessionProfile) {
  return sessionProfile.displayName || sessionProfile.username || "SharePass Member";
}

function resolveActorId(sessionProfile) {
  return createCurrentMemberId(sessionProfile);
}

function hasAdminAccess(sessionProfile, allowClientAdminFallback = false) {
  const adminEmails = getAdminEmailList();

  if (isAdminEmail(sessionProfile.email)) {
    return true;
  }

  return adminEmails.length === 0 && allowClientAdminFallback;
}

function findCircleIndex(circles, circleId) {
  return circles.findIndex(circle => circle.id === circleId);
}

function replaceCircleInList(circles, nextCircle) {
  return circles.map(circle => (circle.id === nextCircle.id ? normalizeCircle(nextCircle) : normalizeCircle(circle)));
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

  if (req.method === "GET") {
    try {
      const circles = await readCircles(db);

      return res.status(200).json({
        circles,
        storage,
        warning,
      });
    } catch (error) {
      console.error("Circle loading failed", error);
      return res.status(500).json({ error: "Circle state could not be loaded right now." });
    }
  }

  const parsedBody = readJsonObjectBody(req);

  if (!parsedBody.ok) {
    return res.status(400).json({ error: parsedBody.error });
  }

  const body = parsedBody.body;
  const sessionProfile = normalizeSessionProfile(body.sessionProfile);
  const actorName = resolveActorName(sessionProfile);
  const actorId = resolveActorId(sessionProfile);
  const currentMood = cleanString(body.currentMood) || "hopeful";
  const allowClientAdminFallback = body.isSuperAdmin === true;

  try {
    const circles = await readCircles(db);

    if (req.method === "POST") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can create circles." });
      }

      const topic = cleanString(body.topic);
      const description = cleanString(body.description);
      const schedule = cleanString(body.schedule);
      const icon = cleanString(body.icon) || "🫶";

      if (!topic || !description || !schedule) {
        return res.status(400).json({ error: "Topic, description, and schedule are required." });
      }

      const nextCircle = createCircleFromDraft({
        topic,
        description,
        schedule,
        icon,
        createdBy: sessionProfile,
      });

      nextCircle.members = [
        createCircleMember({
          id: actorId,
          name: actorName,
          role: "moderator",
          mood: currentMood,
          email: sessionProfile.email,
        }),
      ];
      nextCircle.speakers = [actorId];
      nextCircle.unreadCounts = { [actorId]: 0 };
      nextCircle.voiceSession = {
        active: true,
        updatedAt: new Date().toISOString(),
      };
      nextCircle.lastActivityAt = new Date().toISOString();

      const nextCircles = await replaceCircles(db, [normalizeCircle(nextCircle), ...circles]);

      return res.status(201).json({
        circles: nextCircles,
        storage,
        warning,
      });
    }

    const action = cleanString(body.action).toLowerCase();
    const circleId = cleanString(body.circleId);
    const supportedActions = new Set([
      "mark-read",
      "join",
      "toggle-hand",
      "invite-speaker",
      "move-to-audience",
      "toggle-requests",
      "send-message",
      "post-announcement",
      "remove-member",
      "delete-circle",
    ]);

    if (!action || !circleId) {
      return res.status(400).json({ error: "Action and circleId are required." });
    }

    if (!supportedActions.has(action)) {
      return res.status(400).json({ error: "Unsupported circle action." });
    }

    const circleIndex = findCircleIndex(circles, circleId);

    if (circleIndex < 0) {
      return res.status(404).json({ error: "Circle not found." });
    }

    const currentCircle = normalizeCircle(circles[circleIndex]);
    let nextCircle = currentCircle;

    if (action === "mark-read") {
      nextCircle = markCircleRead(currentCircle, actorId);
    }

    if (action === "join") {
      if (!actorId || !actorName) {
        return res.status(400).json({ error: "A signed-in member is required to join a circle." });
      }

      if (currentCircle.members.some(member => member.id === actorId)) {
        nextCircle = markCircleRead(currentCircle, actorId);
      } else {
        const nextMember = createCircleMember({
          id: actorId,
          name: actorName,
          role: hasAdminAccess(sessionProfile, allowClientAdminFallback) ? "moderator" : "member",
          mood: currentMood,
          email: sessionProfile.email,
        });

        nextCircle = bumpCircleUnreadCounts({
          ...currentCircle,
          members: [...currentCircle.members, nextMember],
          chat: [
            ...currentCircle.chat,
            createCircleMessage({
              author: actorName,
              text: hasAdminAccess(sessionProfile, allowClientAdminFallback)
                ? "I joined this room to help guide the floor and keep the space safe."
                : "I joined the room and I am listening in for now.",
            }),
          ],
        }, actorId);
      }
    }

    if (action === "toggle-hand") {
      if (!currentCircle.members.some(member => member.id === actorId) || currentCircle.speakers.includes(actorId)) {
        return res.status(400).json({ error: "Join the circle before raising your hand." });
      }

      const isQueued = currentCircle.requestQueue.includes(actorId);
      const nextQueue = isQueued
        ? currentCircle.requestQueue.filter(memberId => memberId !== actorId)
        : [...currentCircle.requestQueue, actorId];

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        requestQueue: nextQueue,
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Room",
            text: isQueued
              ? `${actorName} lowered their hand for now.`
              : `${actorName} raised a hand to speak when the floor opens.`,
            type: "announcement",
          }),
        ],
      }, actorId);
    }

    if (action === "invite-speaker") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can invite speakers." });
      }

      const invitedMemberId = cleanString(body.memberId);
      const invitedMember = getCircleMember(currentCircle, invitedMemberId);

      if (!invitedMember) {
        return res.status(404).json({ error: "Member not found in this circle." });
      }

      nextCircle = bumpCircleUnreadCounts(syncCircleVoiceSession({
        ...currentCircle,
        speakers: currentCircle.speakers.includes(invitedMemberId)
          ? currentCircle.speakers
          : [...currentCircle.speakers, invitedMemberId],
        requestQueue: currentCircle.requestQueue.filter(memberId => memberId !== invitedMemberId),
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Moderator",
            text: `${invitedMember.name} was invited to the floor.`,
            type: "announcement",
          }),
        ],
      }), actorId);
    }

    if (action === "move-to-audience") {
      const movingMemberId = cleanString(body.memberId) || actorId;
      const canMove = hasAdminAccess(sessionProfile, allowClientAdminFallback) || movingMemberId === actorId;

      if (!canMove) {
        return res.status(403).json({ error: "You cannot move that speaker." });
      }

      const member = getCircleMember(currentCircle, movingMemberId);

      nextCircle = bumpCircleUnreadCounts(syncCircleVoiceSession({
        ...currentCircle,
        speakers: currentCircle.speakers.filter(memberId => memberId !== movingMemberId),
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Room",
            text: `${member?.name || "A speaker"} moved back to the audience.`,
            type: "announcement",
          }),
        ],
      }), actorId);
    }

    if (action === "toggle-requests") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can change request settings." });
      }

      const allowRequests = !currentCircle.allowRequests;

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        allowRequests,
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Moderator",
            text: allowRequests
              ? "Raise hand requests are open again."
              : "Raise hand requests are paused for the moment.",
            type: "announcement",
          }),
        ],
      }, actorId);
    }

    if (action === "send-message") {
      const text = cleanString(body.text);

      if (!text) {
        return res.status(400).json({ error: "Write a message before sending it." });
      }

      if (!currentCircle.members.some(member => member.id === actorId)) {
        return res.status(400).json({ error: "Join the circle before chatting." });
      }

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        chat: [...currentCircle.chat, createCircleMessage({ author: actorName, text })],
      }, actorId);
    }

    if (action === "post-announcement") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can post announcements." });
      }

      const text = cleanString(body.text);

      if (!text) {
        return res.status(400).json({ error: "Write an announcement before posting it." });
      }

      const createdAt = new Date().toISOString();

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        announcements: [
          {
            id: `announcement-${Date.now()}`,
            title: "Room update",
            body: text,
            createdAt,
            author: actorName,
          },
          ...currentCircle.announcements,
        ],
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: actorName,
            text,
            type: "announcement",
            createdAt,
          }),
        ],
      }, actorId);
    }

    if (action === "remove-member") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can remove members." });
      }

      const targetMemberId = cleanString(body.memberId);

      if (!targetMemberId) {
        return res.status(400).json({ error: "Choose a member to remove." });
      }

      const targetMember = getCircleMember(currentCircle, targetMemberId);

      nextCircle = bumpCircleUnreadCounts(syncCircleVoiceSession({
        ...currentCircle,
        members: currentCircle.members.filter(member => member.id !== targetMemberId),
        speakers: currentCircle.speakers.filter(memberId => memberId !== targetMemberId),
        requestQueue: currentCircle.requestQueue.filter(memberId => memberId !== targetMemberId),
        unreadCounts: Object.fromEntries(
          Object.entries(currentCircle.unreadCounts).filter(([memberId]) => memberId !== targetMemberId),
        ),
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Moderator",
            text: `${targetMember?.name || "A member"} was removed from this circle.`,
            type: "announcement",
          }),
        ],
      }), actorId);
    }

    if (action === "delete-circle") {
      if (!hasAdminAccess(sessionProfile, allowClientAdminFallback)) {
        return res.status(403).json({ error: "Only admins can delete circles." });
      }

      const nextCircles = await replaceCircles(
        db,
        circles.filter(circle => circle.id !== circleId),
      );

      return res.status(200).json({
        circles: nextCircles,
        storage,
        warning,
      });
    }

    const nextCircles = await replaceCircles(db, replaceCircleInList(circles, nextCircle));

    return res.status(200).json({
      circles: nextCircles,
      storage,
      warning: mergeWarnings(warning),
    });
  } catch (error) {
    console.error("Circle update failed", error);
    return res.status(500).json({ error: "Circle changes could not be saved right now." });
  }
}
