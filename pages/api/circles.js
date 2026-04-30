import { mergeWarnings, readJsonObjectBody } from "../../lib/api-route-utils";
import { readAdminSessionEmailFromRequest } from "../../lib/sharepass-admin-session";
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
  clearCircleVoiceRoom,
  isAdminEmail,
  removeCircleVoiceParticipant,
  readCircleVoiceRoom,
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

function hasAdminAccess(adminEmail) {
  return isAdminEmail(adminEmail);
}

function resolveEffectiveAdminEmail(req, sessionProfile = {}) {
  const cookieAdminEmail = readAdminSessionEmailFromRequest(req);

  if (cookieAdminEmail) {
    return cookieAdminEmail;
  }

  if (process.env.NODE_ENV !== "production") {
    return cleanString(sessionProfile.email || req.query?.viewerEmail).toLowerCase();
  }

  return "";
}

function hasRoomModerationAccess(circle, adminEmail, actorId) {
  if (hasAdminAccess(adminEmail)) {
    return true;
  }

  const actorMember = getCircleMember(circle, actorId);
  return actorMember?.role === "moderator";
}

function findCircleIndex(circles, circleId) {
  return circles.findIndex(circle => circle.id === circleId);
}

function replaceCircleInList(circles, nextCircle) {
  return circles.map(circle => (circle.id === nextCircle.id ? normalizeCircle(nextCircle) : normalizeCircle(circle)));
}


function autoInviteNextSpeaker(circle, voiceRoom) {
  // Auto-invite the first queued member if speakers slot is empty and queue is enabled
  if (!circle.voiceSession?.active || circle.speakers.length > 0 || !circle.allowRequests) {
    return circle; // Don't auto-invite if someone is already speaking or queue disabled
  }

  if (!Array.isArray(circle.requestQueue) || circle.requestQueue.length === 0) {
    return circle; // No one in queue
  }

  const nextSpeaker = circle.requestQueue[0];
  const isConnected = voiceRoom?.participants?.some(p => p.memberId === nextSpeaker);

  if (!isConnected) {
    // Next queued person not in audio room yet, skip for now
    return circle;
  }

  const nextMember = getCircleMember(circle, nextSpeaker);
  // Auto-invite the next queued speaker
  return {
    ...circle,
    speakers: [nextSpeaker],
    requestQueue: circle.requestQueue.slice(1),
    chat: [
      ...circle.chat,
      {
        id: `msg-${Date.now()}-${Math.random()}`,
        author: "Room",
        authorRole: "system",
        text: `${nextMember?.name || "Next speaker"} was auto-invited to the floor.`,
        type: "announcement",
        createdAt: new Date().toISOString(),
      },
    ],
  };
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
      if (error?.code === "MONGO_UNAVAILABLE" || storage === "mongo_unavailable") {
        return res.status(503).json({
          error: "Database unavailable. Check MongoDB connection (Atlas network/IP allowlist, credentials, cluster status) and try again.",
          storage,
          warning,
        });
      }
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
  const authenticatedAdminEmail = resolveEffectiveAdminEmail(req, sessionProfile);
  const actorName = resolveActorName(sessionProfile);
  const actorId = resolveActorId(sessionProfile);
  const currentMood = cleanString(body.currentMood) || "hopeful";
  try {
    const circles = await readCircles(db);

    if (req.method === "POST") {
      if (!hasAdminAccess(authenticatedAdminEmail)) {
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
      nextCircle.speakers = [];
      nextCircle.unreadCounts = { [actorId]: 0 };
      nextCircle.voiceSession = {
        active: false,
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
      "toggle-voice-session",
      "update-member-role",
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
    const currentMember = getCircleMember(currentCircle, actorId);
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
          role: hasAdminAccess(authenticatedAdminEmail) ? "moderator" : "member",
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
              authorRole: nextMember.role,
              text: hasAdminAccess(authenticatedAdminEmail)
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

      if (currentMember?.role === "moderator") {
        return res.status(400).json({ error: "Moderators do not need to raise a hand to manage the floor." });
      }

      const isQueued = currentCircle.requestQueue.includes(actorId);
      if (!currentCircle.allowRequests && !isQueued) {
        return res.status(400).json({ error: "Raise hand requests are paused right now." });
      }

      if (!currentCircle.voiceSession?.active) {
        return res.status(400).json({ error: "The moderator has not started the voice floor yet." });
      }

      const voiceRoom = await readCircleVoiceRoom(db, circleId);
      const isConnectedToLiveRoom = voiceRoom.participants.some(participant => participant.memberId === actorId);

      if (!isConnectedToLiveRoom) {
        return res.status(400).json({ error: "Join the live audio room before raising your hand." });
      }

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
            authorRole: "system",
          }),
        ],
      }, actorId);
    }

    if (action === "invite-speaker") {
      if (!hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId)) {
        return res.status(403).json({ error: "Only moderators can invite speakers." });
      }

      const invitedMemberId = cleanString(body.memberId);
      const invitedMember = getCircleMember(currentCircle, invitedMemberId);

      if (!invitedMember) {
        return res.status(404).json({ error: "Member not found in this circle." });
      }

      const voiceRoom = await readCircleVoiceRoom(db, circleId);
      const isInvitedMemberConnected = voiceRoom.participants.some(participant => participant.memberId === invitedMemberId);

      if (!isInvitedMemberConnected) {
        return res.status(400).json({ error: "That member needs to join the live audio room before taking the floor." });
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
            authorRole: "moderator",
            text: `${invitedMember.name} was invited to the floor.`,
            type: "announcement",
          }),
        ],
      }, { active: true }), actorId);
    }

    if (action === "move-to-audience") {
      const movingMemberId = cleanString(body.memberId) || actorId;
      const canMove = hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId) || movingMemberId === actorId;

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
            authorRole: "system",
            text: `${member?.name || "A speaker"} moved back to the audience.`,
            type: "announcement",
          }),
        ],
      }), actorId);
    }

    if (action === "toggle-requests") {
      if (!hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId)) {
        return res.status(403).json({ error: "Only moderators can change request settings." });
      }

      const allowRequests = !currentCircle.allowRequests;

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        allowRequests,
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Moderator",
            authorRole: "moderator",
            text: allowRequests
              ? "Raise hand requests are open again."
              : "Raise hand requests are paused for the moment.",
            type: "announcement",
          }),
        ],
      }, actorId);
    }

    if (action === "toggle-voice-session") {
      if (!hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId)) {
        return res.status(403).json({ error: "Only moderators can start or end the voice floor." });
      }

      const nextActive = !currentCircle.voiceSession?.active;
      const nextVoiceStartedAt = nextActive ? new Date().toISOString() : "";
      const actorMember = getCircleMember(currentCircle, actorId);
      const nextSpeakers = nextActive ? currentCircle.speakers : [];

      nextCircle = bumpCircleUnreadCounts(syncCircleVoiceSession({
        ...currentCircle,
        speakers: nextSpeakers,
        requestQueue: nextActive ? currentCircle.requestQueue : [],
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: actorName,
            authorRole: actorMember?.role || (hasAdminAccess(authenticatedAdminEmail) ? "moderator" : "system"),
            text: nextActive
              ? "The moderator started the live voice floor. Raise your hand if you want to speak."
              : "The moderator ended the live voice floor for now. Chat remains open for support.",
            type: "announcement",
          }),
        ],
      }, {
        active: nextActive,
        startedAt: nextVoiceStartedAt,
      }), actorId);
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
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: actorName,
            authorRole: currentMember?.role || "member",
            text,
          }),
        ],
      }, actorId);
    }

    if (action === "post-announcement") {
      if (!hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId)) {
        return res.status(403).json({ error: "Only moderators can post announcements." });
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
            authorRole: "moderator",
            text,
            type: "announcement",
            createdAt,
          }),
        ],
      }, actorId);
    }

    if (action === "update-member-role") {
      if (!hasAdminAccess(authenticatedAdminEmail)) {
        return res.status(403).json({ error: "Only admins can assign moderators." });
      }

      const targetMemberId = cleanString(body.memberId);
      const nextRole = cleanString(body.role).toLowerCase();

      if (!targetMemberId || !["member", "moderator"].includes(nextRole)) {
        return res.status(400).json({ error: "Choose a member and a valid role." });
      }

      const targetMember = getCircleMember(currentCircle, targetMemberId);

      if (!targetMember) {
        return res.status(404).json({ error: "Member not found in this circle." });
      }

      const moderatorCount = currentCircle.members.filter(member => member.role === "moderator").length;

      if (targetMember.role === "moderator" && nextRole === "member" && moderatorCount <= 1) {
        return res.status(400).json({ error: "Keep at least one moderator in the circle." });
      }

      nextCircle = bumpCircleUnreadCounts({
        ...currentCircle,
        members: currentCircle.members.map(member => (
          member.id === targetMemberId
            ? { ...member, role: nextRole }
            : member
        )),
        chat: [
          ...currentCircle.chat,
          createCircleMessage({
            author: "Admin",
            authorRole: "moderator",
            text: nextRole === "moderator"
              ? `${targetMember.name} is now a moderator for this circle.`
              : `${targetMember.name} is now listening as a member again.`,
            type: "announcement",
          }),
        ],
      }, actorId);
    }

    if (action === "remove-member") {
      if (!hasRoomModerationAccess(currentCircle, authenticatedAdminEmail, actorId)) {
        return res.status(403).json({ error: "Only moderators can remove members." });
      }

      const targetMemberId = cleanString(body.memberId);

      if (!targetMemberId) {
        return res.status(400).json({ error: "Choose a member to remove." });
      }

      const targetMember = getCircleMember(currentCircle, targetMemberId);
      const moderatorCount = currentCircle.members.filter(member => member.role === "moderator").length;

      if (targetMember?.role === "moderator" && moderatorCount <= 1) {
        return res.status(400).json({ error: "Keep at least one moderator in the circle." });
      }

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
            authorRole: "moderator",
            text: `${targetMember?.name || "A member"} was removed from this circle.`,
            type: "announcement",
          }),
        ],
      }), actorId);
    }

    if (action === "delete-circle") {
      if (!hasAdminAccess(authenticatedAdminEmail)) {
        return res.status(403).json({ error: "Only admins can delete circles." });
      }

      await clearCircleVoiceRoom(db, circleId);

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

    if (action === "toggle-voice-session" && !nextCircle.voiceSession?.active) {
      await clearCircleVoiceRoom(db, circleId);
    }

    if (action === "remove-member") {
      const targetMemberId = cleanString(body.memberId);

      if (targetMemberId) {
        await removeCircleVoiceParticipant(db, circleId, targetMemberId);
      }
    }

    return res.status(200).json({
      circles: nextCircles,
      storage,
      warning: mergeWarnings(warning),
    });
  } catch (error) {
    if (error?.code === "MONGO_UNAVAILABLE" || storage === "mongo_unavailable") {
      return res.status(503).json({
        error: "Database unavailable. Circle changes cannot be saved right now.",
        storage,
        warning,
      });
    }
    console.error("Circle update failed", error);
    return res.status(500).json({ error: "Circle changes could not be saved right now." });
  }
}
