import { getMongoDb, isMongoConfigured } from "./mongodb";
import { LEGACY_DEMO_CIRCLE_IDS, normalizeCircle } from "./sharepass-circles";

const CIRCLE_COLLECTION = process.env.MONGODB_COLLECTION_CIRCLES || "circles";
const USER_COLLECTION = process.env.MONGODB_COLLECTION_USERS || "users";
const FEEDBACK_COLLECTION = process.env.MONGODB_COLLECTION_FEEDBACK || "feedback";
const VOICE_COLLECTION = process.env.MONGODB_COLLECTION_VOICE || "voiceRooms";
const VOICE_PARTICIPANT_TTL_MS = 20000;
const VOICE_SIGNAL_TTL_MS = 120000;
let storeSetupPromise = null;

let localCircles = [];
let localUsers = [];
let localFeedback = [];
let localVoiceRooms = [];
let mongoAvailability = {
  configured: false,
  unavailable: false,
  lastError: "",
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createMongoUnavailableError(message) {
  const error = new Error(message || "MongoDB is configured but unreachable right now.");
  error.code = "MONGO_UNAVAILABLE";
  return error;
}

function shouldBlockMemoryFallback() {
  // In production we prefer to fail loudly when Mongo is unreachable.
  // In dev, allow in-memory fallback so the UI/routes keep working.
  const inProduction = process.env.NODE_ENV === "production";
  return Boolean(inProduction && mongoAvailability.configured && mongoAvailability.unavailable);
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

function isLegacyDemoCircle(circle) {
  return LEGACY_DEMO_CIRCLE_IDS.includes(cleanString(circle?.id));
}

function sanitizeCircles(circles) {
  return (Array.isArray(circles) ? circles : [])
    .map(normalizeCircle)
    .filter(circle => !isLegacyDemoCircle(circle));
}

async function ensureMongoStoreSetup(db) {
  if (!db) {
    return;
  }

  if (!storeSetupPromise) {
    storeSetupPromise = Promise.all([
      db.collection(CIRCLE_COLLECTION).createIndex({ id: 1 }, { unique: true }),
      db.collection(CIRCLE_COLLECTION).createIndex({ lastActivityAt: -1 }),
      db.collection(USER_COLLECTION).createIndex({ email: 1 }, { unique: true }),
      db.collection(USER_COLLECTION).createIndex({ lastSeenAt: -1 }),
      db.collection(FEEDBACK_COLLECTION).createIndex({ id: 1 }, { unique: true }),
      db.collection(FEEDBACK_COLLECTION).createIndex({ createdAt: -1 }),
      db.collection(VOICE_COLLECTION).createIndex({ circleId: 1 }, { unique: true }),
      db.collection(VOICE_COLLECTION).createIndex({ updatedAt: -1 }),
    ]).catch(error => {
      storeSetupPromise = null;
      throw error;
    });
  }

  await storeSetupPromise;
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
    mongoAvailability.configured = isMongoConfigured();
    const db = await getMongoDb();

    if (!db) {
      mongoAvailability.unavailable = false;
      mongoAvailability.lastError = "";
      return {
        db: null,
        storage: "memory",
        warning: "MongoDB is not configured yet. SharePass is using in-memory storage, so shared data will only be fresh within this running session.",
      };
    }

    await ensureMongoStoreSetup(db);
    mongoAvailability.unavailable = false;
    mongoAvailability.lastError = "";

    return {
      db,
      storage: "mongo",
      warning: "",
    };
  } catch (error) {
    mongoAvailability.configured = isMongoConfigured();
    mongoAvailability.unavailable = mongoAvailability.configured;
    mongoAvailability.lastError = cleanString(error?.message) || String(error || "");

    const inProduction = process.env.NODE_ENV === "production";
    if (mongoAvailability.unavailable && inProduction) {
      return {
        db: null,
        storage: "mongo_unavailable",
        warning: mongoAvailability.lastError || "MongoDB is configured but unreachable right now.",
      };
    }

    return {
      db: null,
      storage: "memory",
      warning: "MongoDB is unreachable right now; SharePass is using in-memory storage for this session.",
    };
  }
}

export async function readCircles(db) {
  if (!db) {
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
    localCircles = sanitizeCircles(localCircles);
    return [...localCircles];
  }

  const circles = await db
    .collection(CIRCLE_COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  const legacyDemoCircleIds = circles
    .filter(isLegacyDemoCircle)
    .map(circle => circle.id);

  if (legacyDemoCircleIds.length > 0) {
    await db.collection(CIRCLE_COLLECTION).deleteMany({ id: { $in: legacyDemoCircleIds } });
    await db.collection(VOICE_COLLECTION).deleteMany({ circleId: { $in: legacyDemoCircleIds } });
  }

  return sanitizeCircles(circles);
}

export async function replaceCircles(db, circles) {
  const normalizedCircles = sanitizeCircles(circles);

  if (!db) {
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
    localUsers = localUsers.filter(user => user.email !== email);
    return;
  }

  await db.collection(USER_COLLECTION).deleteOne({ email });
}

export async function readFeedback(db) {
  if (!db) {
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
    if (shouldBlockMemoryFallback()) {
      throw createMongoUnavailableError(mongoAvailability.lastError);
    }
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
