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

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Participants who have not sent a heartbeat in this many milliseconds are
 * considered stale and will be pruned from GET responses. The client sends
 * heartbeats every 4 s so 12 s is three missed beats.
 */
const STALE_PARTICIPANT_MS = 12_000;

// ─── Pure helpers ────────────────────────────────────────────────────────────

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

function resolveActorId(sessionProfile) {
  return createCurrentMemberId(sessionProfile);
}

function resolveActorName(sessionProfile) {
  return sessionProfile.displayName || sessionProfile.username || "SharePass Member";
}

function canAccessVoiceRoom(circle, sessionProfile, actorId) {
  if (isAdminEmail(sessionProfile.email)) return true;
  return Boolean(getCircleMember(circle, actorId));
}

/**
 * Remove participants whose heartbeat timestamp is older than STALE_PARTICIPANT_MS.
 * This ensures the client never negotiates with a ghost peer.
 */
function filterStaleParticipants(participants) {
  const cutoff = Date.now() - STALE_PARTICIPANT_MS;
  return participants.filter((p) => {
    const ts = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : new Date(p.joinedAt).getTime();
    return ts >= cutoff;
  });
}

function sortParticipants(left, right, circle) {
  const leftMember = getCircleMember(circle, left.memberId);
  const rightMember = getCircleMember(circle, right.memberId);
  const leftPriority = leftMember?.role === "moderator" ? 2 : circle.speakers.includes(left.memberId) ? 1 : 0;
  const rightPriority = rightMember?.role === "moderator" ? 2 : circle.speakers.includes(right.memberId) ? 1 : 0;
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  return new Date(left.joinedAt) - new Date(right.joinedAt);
}

/**
 * Build the response shape the client expects.
 *
 * Key fix: signals are filtered to only the requesting actor AND are sorted
 * oldest-first so the client can process offer → answer → ICE in order.
 * Stale participants are stripped so WebRTC negotiation is never attempted
 * toward a peer that has already disconnected.
 */
function createVoiceRoomResponse(circle, room, actorId) {
  const activeMemberIds = new Set(circle.members.map((m) => m.id));
  const liveParticipants = filterStaleParticipants(room.participants || []);

  const participants = liveParticipants
    .filter((p) => activeMemberIds.has(p.memberId))
    .map((p) => {
      const circleMember = getCircleMember(circle, p.memberId);
      return {
        ...p,
        name: circleMember?.name || p.name,
        role: circleMember?.role || p.role || "member",
        onFloor: circle.speakers.includes(p.memberId),
        isModerator: circleMember?.role === "moderator",
      };
    })
    .sort((a, b) => sortParticipants(a, b, circle));

  // Only deliver signals addressed to this actor, oldest first so the client
  // processes them in the correct WebRTC handshake order.
  const signals = (room.signals || [])
    .filter((s) => s.toMemberId === actorId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    active: Boolean(circle.voiceSession?.active),
    startedAt: circle.voiceSession?.startedAt || "",
    participants,
    signals,
    updatedAt: room.updatedAt,
  };
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}

// ─── Route handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendMethodNotAllowed(res);
  }

  const { db, storage, warning } = await resolveStore();

  try {
    // ── GET: poll for room state + signals ──────────────────────────────────
    if (req.method === "GET") {
      const circleId = cleanString(req.query.circleId);
      const sessionProfile = normalizeSessionProfile(req.query);
      const actorId = resolveActorId(sessionProfile);

      if (!circleId) {
        return res.status(400).json({ error: "Choose a circle before opening the voice room." });
      }

      const circles = await readCircles(db);
      const circle = circles.find((c) => c.id === circleId);

      if (!circle) {
        return res.status(404).json({ error: "Circle not found." });
      }

      const normalizedCircle = normalizeCircle(circle);

      if (!canAccessVoiceRoom(normalizedCircle, sessionProfile, actorId)) {
        return res.status(403).json({ error: "Join this circle before opening the audio room." });
      }

      if (!normalizedCircle.voiceSession?.active) {
        // Voice session ended — wipe the room so no stale signals survive.
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

    // ── POST: voice actions ─────────────────────────────────────────────────
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

    const supportedActions = new Set(["join", "heartbeat", "set-muted", "leave", "signal", "ack-signals"]);

    if (!circleId || !action) {
      return res.status(400).json({ error: "Circle and voice action are required." });
    }

    if (!supportedActions.has(action)) {
      return res.status(400).json({ error: "Unsupported voice action." });
    }

    const circles = await readCircles(db);
    const circle = circles.find((c) => c.id === circleId);

    if (!circle) {
      return res.status(404).json({ error: "Circle not found." });
    }

    const normalizedCircle = normalizeCircle(circle);
    const currentMember = getCircleMember(normalizedCircle, actorId);

    if (!canAccessVoiceRoom(normalizedCircle, sessionProfile, actorId)) {
      return res.status(403).json({ error: "Join this circle before using its audio room." });
    }

    // ── leave: always allowed even if voice session ended ───────────────────
    if (action === "leave") {
      const room = await removeCircleVoiceParticipant(db, circleId, actorId);
      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    // All other actions require an active voice session.
    if (!normalizedCircle.voiceSession?.active) {
      await clearCircleVoiceRoom(db, circleId);
      return res.status(400).json({ error: "The live voice floor is not active right now." });
    }

    if (!currentMember && !isAdminEmail(sessionProfile.email)) {
      return res.status(403).json({ error: "Join the circle before using the audio room." });
    }

    // Shared participant metadata used by join / heartbeat / set-muted / signal
    const participantMeta = {
      memberId: actorId,
      name: currentMember?.name || actorName,
      role: currentMember?.role || (isAdminEmail(sessionProfile.email) ? "moderator" : "member"),
      muted: Boolean(body.muted),
    };

    // ── join ────────────────────────────────────────────────────────────────
    if (action === "join") {
      const room = await upsertCircleVoiceParticipant(db, circleId, participantMeta);
      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    // ── heartbeat / set-muted ───────────────────────────────────────────────
    if (action === "heartbeat" || action === "set-muted") {
      const room = await updateCircleVoiceParticipant(db, circleId, actorId, participantMeta);
      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    // ── signal (WebRTC offer / answer / ICE) ────────────────────────────────
    if (action === "signal") {
      const toMemberId = cleanString(body.toMemberId);
      const type = cleanString(body.type).toLowerCase();

      if (!toMemberId || !["offer", "answer", "ice"].includes(type)) {
        return res.status(400).json({ error: "Choose a valid voice target and signal type." });
      }

      if (toMemberId === actorId) {
        return res.status(400).json({ error: "Voice signals must target another participant." });
      }

      // Make sure the sender appears in the participant list before checking the receiver.
      const roomWithSender = await upsertCircleVoiceParticipant(db, circleId, participantMeta);

      // Validate that the intended receiver is actually connected (and not stale).
      const liveReceiverIds = new Set(
        filterStaleParticipants(roomWithSender.participants).map((p) => p.memberId),
      );

      if (!liveReceiverIds.has(toMemberId)) {
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
          // Prefer the enriched participant list from upsert if the signal
          // write returned an empty list (implementation-dependent).
          participants: room.participants.length > 0 ? room.participants : roomWithSender.participants,
        }, actorId),
        storage,
        warning: mergeWarnings(warning),
      });
    }

    // ── ack-signals ─────────────────────────────────────────────────────────
    if (action === "ack-signals") {
      const signalIds = Array.isArray(body.signalIds) ? body.signalIds : [];

      if (signalIds.length === 0) {
        // Nothing to acknowledge — return current room state without a write.
        const room = await readCircleVoiceRoom(db, circleId);
        return res.status(200).json({
          room: createVoiceRoomResponse(normalizedCircle, room, actorId),
          storage,
          warning,
        });
      }

      const room = await acknowledgeCircleVoiceSignals(db, circleId, actorId, signalIds);
      return res.status(200).json({
        room: createVoiceRoomResponse(normalizedCircle, room, actorId),
        storage,
        warning,
      });
    }

    return res.status(400).json({ error: "Unsupported voice action." });
  } catch (error) {
    if (error?.code === "MONGO_UNAVAILABLE" || storage === "mongo_unavailable") {
      return res.status(503).json({
        error: "Database unavailable. The audio room cannot sync right now.",
        storage,
        warning,
      });
    }
    console.error("Circle voice route failed", error);
    return res.status(500).json({ error: "The audio room could not be updated right now." });
  }
}