import { mergeWarnings, readJsonObjectBody } from "../../lib/api-route-utils";
import {
  createCurrentMemberId,
  getCircleMember,
  normalizeCircle,
} from "../../lib/sharepass-circles";
import {
  acknowledgeCircleVoiceSignals,
  addCircleVoiceSignal,
  clearCircleVoiceRoom,
  isAdminEmail,
  readCircleVoiceRoom,
  readCircles,
  removeCircleVoiceParticipant,
  resolveStore,
  updateCircleVoiceParticipant,
  upsertCircleVoiceParticipant,
} from "../../lib/sharepass-server-store";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionProfile(sessionProfile = {}) {
  return {
    username: cleanString(sessionProfile.username),
    displayName: cleanString(sessionProfile.displayName),
    email: cleanString(sessionProfile.email).toLowerCase(),
    voiceMemberId: cleanString(sessionProfile.voiceMemberId),
  };
}

function resolveActorId(sessionProfile) {
  if (sessionProfile.voiceMemberId) {
    return sessionProfile.voiceMemberId;
  }

  return createCurrentMemberId(sessionProfile);
}

function resolveActorName(sessionProfile) {
  return sessionProfile.displayName || sessionProfile.username || "SharePass Member";
}

function canAccessVoiceRoom(circle, sessionProfile, actorId) {
  if (isAdminEmail(sessionProfile.email)) {
    return true;
  }

  return Boolean(getCircleMember(circle, actorId));
}

function sortParticipants(left, right, circle) {
  const leftMember = getCircleMember(circle, left.memberId);
  const rightMember = getCircleMember(circle, right.memberId);
  const leftPriority = leftMember?.role === "moderator" ? 2 : circle.speakers.includes(left.memberId) ? 1 : 0;
  const rightPriority = rightMember?.role === "moderator" ? 2 : circle.speakers.includes(right.memberId) ? 1 : 0;

  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  return new Date(left.joinedAt) - new Date(right.joinedAt);
}

function createVoiceRoomResponse(circle, room, actorId) {
  const activeMemberIds = new Set(circle.members.map(member => member.id));
  const participants = room.participants
    .filter(participant => activeMemberIds.has(participant.memberId))
    .map(participant => {
      const circleMember = getCircleMember(circle, participant.memberId);

      return {
        ...participant,
        name: circleMember?.name || participant.name,
        role: circleMember?.role || participant.role || "member",
        onFloor: circle.speakers.includes(participant.memberId),
        isModerator: circleMember?.role === "moderator",
      };
    })
    .sort((left, right) => sortParticipants(left, right, circle));

  return {
    active: Boolean(circle.voiceSession?.active),
    startedAt: circle.voiceSession?.startedAt || "",
    participants,
    signals: room.signals
      .filter(signal => signal.toMemberId === actorId)
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)),
    updatedAt: room.updatedAt,
  };
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendMethodNotAllowed(res);
  }

  const { db, storage, warning } = await resolveStore();

  try {
    if (req.method === "GET") {
      const circleId = cleanString(req.query.circleId);
      const sessionProfile = normalizeSessionProfile(req.query);
      const actorId = resolveActorId(sessionProfile);

      if (!circleId) {
        return res.status(400).json({ error: "Choose a circle before opening the voice room." });
      }

      const circles = await readCircles(db);
      const circle = circles.find(item => item.id === circleId);

      if (!circle) {
        return res.status(404).json({ error: "Circle not found." });
      }

      const normalizedCircle = normalizeCircle(circle);

      if (!canAccessVoiceRoom(normalizedCircle, sessionProfile, actorId)) {
        return res.status(403).json({ error: "Join this circle before opening the audio room." });
      }

      if (!normalizedCircle.voiceSession?.active) {
        await clearCircleVoiceRoom(db, circleId);

        return res.status(200).json({
          room: {
            active: false,
            startedAt: "",
            participants: [],
            signals: [],
            updatedAt: new Date().toISOString(),
          },
          storage,
          warning,
        });
      }

      const room = await readCircleVoiceRoom(db, circleId);

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    const parsedBody = readJsonObjectBody(req);

    if (!parsedBody.ok) {
      return res.status(400).json({ error: parsedBody.error });
    }

    const body = parsedBody.body;
    const action = cleanString(body.action).toLowerCase();
    const circleId = cleanString(body.circleId);
    const sessionProfile = normalizeSessionProfile(body.sessionProfile);
    const actorId = resolveActorId(sessionProfile);
    const actorName = resolveActorName(sessionProfile);
    const supportedActions = new Set([
      "join",
      "heartbeat",
      "set-muted",
      "leave",
      "signal",
      "ack-signals",
    ]);

    if (!circleId || !action) {
      return res.status(400).json({ error: "Circle and voice action are required." });
    }

    if (!supportedActions.has(action)) {
      return res.status(400).json({ error: "Unsupported voice action." });
    }

    const circles = await readCircles(db);
    const circle = circles.find(item => item.id === circleId);

    if (!circle) {
      return res.status(404).json({ error: "Circle not found." });
    }

    const normalizedCircle = normalizeCircle(circle);
    const currentMember = getCircleMember(normalizedCircle, actorId);

    if (!canAccessVoiceRoom(normalizedCircle, sessionProfile, actorId)) {
      return res.status(403).json({ error: "Join this circle before using its audio room." });
    }

    if (action === "leave") {
      const room = await removeCircleVoiceParticipant(db, circleId, actorId);

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    if (!normalizedCircle.voiceSession?.active) {
      await clearCircleVoiceRoom(db, circleId);
      return res.status(400).json({ error: "The live voice floor is not active right now." });
    }

    if (!currentMember && !isAdminEmail(sessionProfile.email)) {
      return res.status(403).json({ error: "Join the circle before using the audio room." });
    }

    if (action === "join") {
      const room = await upsertCircleVoiceParticipant(db, circleId, {
        memberId: actorId,
        name: currentMember?.name || actorName,
        role: currentMember?.role || (isAdminEmail(sessionProfile.email) ? "moderator" : "member"),
        muted: Boolean(body.muted),
      });

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    if (action === "heartbeat" || action === "set-muted") {
      const room = await updateCircleVoiceParticipant(db, circleId, actorId, {
        name: currentMember?.name || actorName,
        role: currentMember?.role || (isAdminEmail(sessionProfile.email) ? "moderator" : "member"),
        muted: Boolean(body.muted),
      });

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    if (action === "signal") {
      const toMemberId = cleanString(body.toMemberId);
      const type = cleanString(body.type).toLowerCase();

      if (!toMemberId || !["offer", "answer", "ice"].includes(type)) {
        return res.status(400).json({ error: "Choose a valid voice target and signal type." });
      }

      if (toMemberId === actorId) {
        return res.status(400).json({ error: "Voice signals must target another participant." });
      }

      const roomWithParticipant = await upsertCircleVoiceParticipant(db, circleId, {
        memberId: actorId,
        name: currentMember?.name || actorName,
        role: currentMember?.role || (isAdminEmail(sessionProfile.email) ? "moderator" : "member"),
        muted: Boolean(body.muted),
      });

      const receiverConnected = roomWithParticipant.participants
        .some(participant => participant.memberId === toMemberId);

      if (!receiverConnected) {
        return res.status(400).json({ error: "The target participant is not connected to audio right now." });
      }

      const room = await addCircleVoiceSignal(db, circleId, {
        fromMemberId: actorId,
        toMemberId,
        type,
        payload: body.payload ?? null,
      });

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, {
          ...room,
          participants: room.participants.length > 0 ? room.participants : roomWithParticipant.participants,
        }, actorId),
        storage,
        warning: mergeWarnings(warning),
      });
    }

    if (action === "ack-signals") {
      const room = await acknowledgeCircleVoiceSignals(db, circleId, actorId, body.signalIds);

      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    return res.status(400).json({ error: "Unsupported voice action." });
  } catch (error) {
    console.error("Circle voice route failed", error);
    return res.status(500).json({ error: "The audio room could not be updated right now." });
  }
}
