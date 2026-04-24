import { buildNewPost, EMOTIONS, normalizePost, SEED_POSTS } from "../../lib/sharepass-data";
import { getMongoCollectionName, getMongoDb } from "../../lib/mongodb";

let localPosts = SEED_POSTS.map(normalizePost);

function sortPosts(posts) {
  return [...posts].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

async function resolveStorage() {
  try {
    const db = await getMongoDb();

    if (!db) {
      return {
        db: null,
        storage: "memory",
        warning: "MongoDB is not configured yet. SharePass is using in-memory demo storage for now.",
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

function isValidEmotion(emotion) {
  return EMOTIONS.some(item => item.id === emotion);
}

function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  const { db, storage, warning } = await resolveStorage();

  if (req.method === "GET") {
    if (db) {
      const posts = await db
        .collection(getMongoCollectionName())
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      return res.status(200).json({
        posts: posts.map(normalizePost),
        storage,
        warning,
      });
    }

    return res.status(200).json({
      posts: sortPosts(localPosts),
      storage,
      warning,
    });
  }

  try {
    const content = String(req.body?.content || "").trim();
    const reflection = String(req.body?.reflection || "").trim();
    const emotion = String(req.body?.emotion || "").trim();
    const visibility = String(req.body?.visibility || "public").trim();

    if (content.length < 10) {
      return res.status(400).json({ error: "Posts should contain at least 10 characters." });
    }

    if (!isValidEmotion(emotion)) {
      return res.status(400).json({ error: "Choose a valid emotion before sharing." });
    }

    if (!["public", "circle", "private"].includes(visibility)) {
      return res.status(400).json({ error: "Choose a valid visibility setting." });
    }

    const post = buildNewPost({
      emotion,
      content,
      reflection,
      visibility,
    });

    if (db) {
      await db.collection(getMongoCollectionName()).insertOne(post);
    } else {
      localPosts = sortPosts([post, ...localPosts]);
    }

    return res.status(201).json({
      post,
      storage,
      warning,
    });
  } catch (error) {
    console.error("Post publishing failed", error);
    return res.status(500).json({ error: "Your post could not be saved right now. Please try again." });
  }
}
