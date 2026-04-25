import { getMongoDb } from "./mongodb";
import { createSeedCircles, normalizeCircle } from "./sharepass-circles";

const CIRCLE_COLLECTION = process.env.MONGODB_COLLECTION_CIRCLES || "circles";
const USER_COLLECTION = process.env.MONGODB_COLLECTION_USERS || "users";
const FEEDBACK_COLLECTION = process.env.MONGODB_COLLECTION_FEEDBACK || "feedback";

let localCircles = createSeedCircles().map(normalizeCircle);
let localUsers = [];
let localFeedback = [];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmailList() {
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
