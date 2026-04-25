import { getMongoDb } from "./mongodb";
import { createSeedCircles, normalizeCircle } from "./sharepass-circles";

const CIRCLE_COLLECTION = process.env.MONGODB_COLLECTION_CIRCLES || "circles";
const USER_COLLECTION = process.env.MONGODB_COLLECTION_USERS || "users";
const FEEDBACK_COLLECTION = process.env.MONGODB_COLLECTION_FEEDBACK || "feedback";
const VOICE_COLLECTION = process.env.MONGODB_COLLECTION_VOICE || "voiceRooms";
const VOICE_PARTICIPANT_TTL_MS = 20000;
const VOICE_SIGNAL_TTL_MS = 120000;

let localCircles = createSeedCircles().map(normalizeCircle);
let localUsers = [];
let localFeedback = [];
let localVoiceRooms = [];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function createTimestamp() {
  return new Date().toISOString();
}

function createEmptyVoiceRoom(circleId) {
  return {
    circleId: cleanString(circleId),
    participants: [],
    signals: [],
    updatedAt: createTimestamp(),
  };
}

function normalizeVoiceParticipant(participant = {}) {
  const memberId = cleanString(participant.memberId);
  const joinedAt = cleanString(participant.joinedAt) || createTimestamp();
  const lastSeenAt = cleanString(participant.lastSeenAt) || createTimestamp();

  return {
    memberId,
    name: cleanString(participant.name) || "SharePass Member",
    role: cleanString(participant.role) || "member",
    muted: Boolean(participant.muted),
    joinedAt,
    lastSeenAt,
  };
}

function normalizeVoiceSignal(signal = {}) {
  return {
    id: cleanString(signal.id) || `signal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fromMemberId: cleanString(signal.fromMemberId),
    toMemberId: cleanString(signal.toMemberId),
    type: cleanString(signal.type),
    payload: signal.payload ?? null,
    createdAt: cleanString(signal.createdAt) || createTimestamp(),
  };
}

function normalizeVoiceRoom(room = {}, circleId = "") {
  const resolvedCircleId = cleanString(room.circleId) || cleanString(circleId);

  return {
    circleId: resolvedCircleId,
    participants: Array.isArray(room.participants)
      ? room.participants
          .map(normalizeVoiceParticipant)
          .filter(participant => participant.memberId)
      : [],
    signals: Array.isArray(room.signals)
      ? room.signals
          .map(normalizeVoiceSignal)
          .filter(signal => signal.id && signal.fromMemberId && signal.toMemberId && signal.type)
      : [],
    updatedAt: cleanString(room.updatedAt) || createTimestamp(),
  };
}

function pruneVoiceRoom(room = {}, circleId = "") {
  const normalizedRoom = normalizeVoiceRoom(room, circleId);
  const nowMs = Date.now();
  const activeParticipants = normalizedRoom.participants.filter(participant => {
    const lastSeenMs = new Date(participant.lastSeenAt).getTime();
    return Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= VOICE_PARTICIPANT_TTL_MS;
  });
  const activeParticipantIds = new Set(activeParticipants.map(participant => participant.memberId));
  const signals = normalizedRoom.signals.filter(signal => {
    const createdAtMs = new Date(signal.createdAt).getTime();

    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > VOICE_SIGNAL_TTL_MS) {
      return false;
    }

    return activeParticipantIds.has(signal.fromMemberId);
  });

  return normalizeVoiceRoom({
    ...normalizedRoom,
    participants: activeParticipants,
    signals,
    updatedAt: createTimestamp(),
  }, normalizedRoom.circleId);
}

async function persistVoiceRoom(db, room) {
  const normalizedRoom = pruneVoiceRoom(room, room.circleId);

  if (!db) {
    localVoiceRooms = normalizedRoom.participants.length > 0 || normalizedRoom.signals.length > 0
      ? [
          normalizedRoom,
          ...localVoiceRooms.filter(currentRoom => currentRoom.circleId !== normalizedRoom.circleId),
        ]
      : localVoiceRooms.filter(currentRoom => currentRoom.circleId !== normalizedRoom.circleId);

    return normalizedRoom;
  }

  if (normalizedRoom.participants.length === 0 && normalizedRoom.signals.length === 0) {
    await db.collection(VOICE_COLLECTION).deleteOne({ circleId: normalizedRoom.circleId });
    return normalizedRoom;
  }

  await db.collection(VOICE_COLLECTION).updateOne(
    { circleId: normalizedRoom.circleId },
    { $set: normalizedRoom },
    { upsert: true },
  );

  return normalizedRoom;
}

export function getAdminEmailList() {
  const serverOnlyAdmins = parseEmailList(process.env.SUPER_ADMIN_EMAILS);

  if (serverOnlyAdmins.length > 0) {
    return serverOnlyAdmins;
  }

  return parseEmailList(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS);
}

export function isAdminEmail(email) {
  const normalizedEmail = cleanString(email).toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  return getAdminEmailList().includes(normalizedEmail);
}

export async function resolveStore() {
  try {
    const db = await getMongoDb();

    if (!db) {
      return {
        db: null,
        storage: "memory",
        warning: "MongoDB is not configured yet. SharePass is using in-memory demo storage for app state for now.",
      };
    }

    return {
      db,
      storage: "mongo",
      warning: "",
    };
  } catch (error) {
    return {
      db: null,
      storage: "memory",
      warning: error.message,
    };
  }
}

export async function readCircles(db) {
  if (!db) {
    return localCircles.map(normalizeCircle);
  }

  const circles = await db
    .collection(CIRCLE_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  if (circles.length === 0) {
    const seeds = createSeedCircles().map(normalizeCircle);
    await db.collection(CIRCLE_COLLECTION).insertMany(seeds);
    return seeds;
  }

  return circles.map(normalizeCircle);
}

export async function replaceCircles(db, circles) {
  const normalizedCircles = circles.map(normalizeCircle);

  if (!db) {
    localCircles = normalizedCircles;
    return normalizedCircles;
  }

  await db.collection(CIRCLE_COLLECTION).deleteMany({});

  if (normalizedCircles.length > 0) {
    await db.collection(CIRCLE_COLLECTION).insertMany(normalizedCircles);
  }

  return normalizedCircles;
}

export async function readUsers(db) {
  if (!db) {
    return [...localUsers];
  }

  return db
    .collection(USER_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .toArray();
}

export async function upsertUser(db, user) {
  if (!db) {
    const nextUsers = [
      user,
      ...localUsers.filter(currentUser => currentUser.email !== user.email),
    ];
    localUsers = nextUsers;
    return user;
  }

  await db.collection(USER_COLLECTION).updateOne(
    { email: user.email },
    { $set: user },
    { upsert: true },
  );

  return user;
}

export async function deleteUserByEmail(db, email) {
  if (!db) {
    localUsers = localUsers.filter(user => user.email !== email);
    return;
  }

  await db.collection(USER_COLLECTION).deleteOne({ email });
}

export async function readFeedback(db) {
  if (!db) {
    return [...localFeedback].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  return db
    .collection(FEEDBACK_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function saveFeedback(db, item) {
  if (!db) {
    localFeedback = [item, ...localFeedback.filter(currentItem => currentItem.id !== item.id)];
    return item;
  }

  await db.collection(FEEDBACK_COLLECTION).updateOne(
    { id: item.id },
    { $set: item },
    { upsert: true },
  );

  return item;
}

export async function updateFeedbackStatus(db, feedbackId, status) {
  if (!db) {
    localFeedback = localFeedback.map(item => (
      item.id === feedbackId
        ? { ...item, status, updatedAt: new Date().toISOString() }
        : item
    ));

    return localFeedback.find(item => item.id === feedbackId) || null;
  }

  await db.collection(FEEDBACK_COLLECTION).updateOne(
    { id: feedbackId },
    {
      $set: {
        status,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  return db.collection(FEEDBACK_COLLECTION).findOne(
    { id: feedbackId },
    { projection: { _id: 0 } },
  );
}

export async function readCircleVoiceRoom(db, circleId) {
  const normalizedCircleId = cleanString(circleId);

  if (!normalizedCircleId) {
    return createEmptyVoiceRoom("");
  }

  if (!db) {
    const room = localVoiceRooms.find(currentRoom => currentRoom.circleId === normalizedCircleId) || createEmptyVoiceRoom(normalizedCircleId);
    return persistVoiceRoom(null, room);
  }

  const room = await db.collection(VOICE_COLLECTION).findOne(
    { circleId: normalizedCircleId },
    { projection: { _id: 0 } },
  );

  if (!room) {
    return createEmptyVoiceRoom(normalizedCircleId);
  }

  return persistVoiceRoom(db, room);
}

export async function clearCircleVoiceRoom(db, circleId) {
  const normalizedCircleId = cleanString(circleId);

  if (!normalizedCircleId) {
    return createEmptyVoiceRoom("");
  }

  if (!db) {
    localVoiceRooms = localVoiceRooms.filter(room => room.circleId !== normalizedCircleId);
    return createEmptyVoiceRoom(normalizedCircleId);
  }

  await db.collection(VOICE_COLLECTION).deleteOne({ circleId: normalizedCircleId });
  return createEmptyVoiceRoom(normalizedCircleId);
}

export async function upsertCircleVoiceParticipant(db, circleId, participant) {
  const room = await readCircleVoiceRoom(db, circleId);
  const nextParticipant = normalizeVoiceParticipant({
    ...room.participants.find(currentParticipant => currentParticipant.memberId === cleanString(participant.memberId)),
    ...participant,
    memberId: cleanString(participant.memberId),
    joinedAt: room.participants.find(currentParticipant => currentParticipant.memberId === cleanString(participant.memberId))?.joinedAt || cleanString(participant.joinedAt) || createTimestamp(),
    lastSeenAt: createTimestamp(),
  });
  const nextRoom = {
    ...room,
    participants: nextParticipant.memberId
      ? [
          nextParticipant,
          ...room.participants.filter(currentParticipant => currentParticipant.memberId !== nextParticipant.memberId),
        ]
      : room.participants,
    updatedAt: createTimestamp(),
  };

  return persistVoiceRoom(db, nextRoom);
}

export async function updateCircleVoiceParticipant(db, circleId, memberId, updates = {}) {
  const normalizedMemberId = cleanString(memberId);
  if (!normalizedMemberId) {
    return readCircleVoiceRoom(db, circleId);
  }

  const room = await readCircleVoiceRoom(db, circleId);
  const existingParticipant = room.participants.find(participant => participant.memberId === normalizedMemberId);

  if (!existingParticipant) {
    return room;
  }

  return persistVoiceRoom(db, {
    ...room,
    participants: room.participants.map(participant => (
      participant.memberId === normalizedMemberId
        ? normalizeVoiceParticipant({
            ...participant,
            ...updates,
            memberId: normalizedMemberId,
            joinedAt: participant.joinedAt,
            lastSeenAt: createTimestamp(),
          })
        : participant
    )),
    updatedAt: createTimestamp(),
  });
}

export async function removeCircleVoiceParticipant(db, circleId, memberId) {
  const normalizedMemberId = cleanString(memberId);
  if (!normalizedMemberId) {
    return readCircleVoiceRoom(db, circleId);
  }

  const room = await readCircleVoiceRoom(db, circleId);

  return persistVoiceRoom(db, {
    ...room,
    participants: room.participants.filter(participant => participant.memberId !== normalizedMemberId),
    signals: room.signals.filter(signal => signal.fromMemberId !== normalizedMemberId && signal.toMemberId !== normalizedMemberId),
    updatedAt: createTimestamp(),
  });
}

export async function addCircleVoiceSignal(db, circleId, signal) {
  const room = await readCircleVoiceRoom(db, circleId);
  const nextSignal = normalizeVoiceSignal({
    ...signal,
    createdAt: createTimestamp(),
  });

  return persistVoiceRoom(db, {
    ...room,
    signals: nextSignal.id
      ? [...room.signals, nextSignal]
      : room.signals,
    updatedAt: createTimestamp(),
  });
}

export async function acknowledgeCircleVoiceSignals(db, circleId, memberId, signalIds = []) {
  const normalizedMemberId = cleanString(memberId);
  const normalizedSignalIds = new Set(
    (Array.isArray(signalIds) ? signalIds : [])
      .map(signalId => cleanString(signalId))
      .filter(Boolean),
  );

  if (!normalizedMemberId || normalizedSignalIds.size === 0) {
    return readCircleVoiceRoom(db, circleId);
  }

  const room = await readCircleVoiceRoom(db, circleId);

  return persistVoiceRoom(db, {
    ...room,
    signals: room.signals.filter(signal => !(signal.toMemberId === normalizedMemberId && normalizedSignalIds.has(signal.id))),
    updatedAt: createTimestamp(),
  });
}
