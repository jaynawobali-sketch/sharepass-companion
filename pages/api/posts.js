import { mergeWarnings, readJsonObjectBody } from "../../lib/api-route-utils";
import { buildNewPost, EMOTIONS, LEGACY_DEMO_POST_IDS, normalizePost } from "../../lib/sharepass-data";
import { getMongoCollectionName, getMongoDb } from "../../lib/mongodb";

let postSetupPromise = null;
let localPosts = [];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function sanitizePosts(posts) {
  return sortPosts(
    (Array.isArray(posts) ? posts : [])
      .map(normalizePost)
      .filter(post => !LEGACY_DEMO_POST_IDS.includes(String(post.id))),
  );
}

async function ensurePostStorageSetup(db) {
  if (!db) {
    return;
  }

  if (!postSetupPromise) {
    postSetupPromise = Promise.all([
      db.collection(getMongoCollectionName()).createIndex({ id: 1 }, { unique: true }),
      db.collection(getMongoCollectionName()).createIndex({ createdAt: -1 }),
    ]).catch(error => {
      postSetupPromise = null;
      throw error;
    });
  }

  await postSetupPromise;
}

function normalizeViewerIdentity(query = {}) {
  const viewerId = cleanString(query.viewerId);
  const username = cleanString(query.username);
  const entryMethod = cleanString(query.entryMethod).toLowerCase();

  return {
    viewerId,
    username,
    isSignedIn: Boolean(entryMethod && entryMethod !== "guest"),
  };
}

function isOwnPost(post, viewer) {
  const normalizedAuthorId = cleanString(post.authorId);

  if (viewer.viewerId && normalizedAuthorId) {
    return viewer.viewerId === normalizedAuthorId;
  }

  return Boolean(viewer.username && cleanString(post.username) === viewer.username);
}

function isPostVisibleToViewer(post, viewer) {
  if (post.visibility === "private") {
    return isOwnPost(post, viewer);
  }

  if (post.visibility === "circle") {
    return viewer.isSignedIn || isOwnPost(post, viewer);
  }

  return true;
}

function filterVisiblePosts(posts, viewer) {
  return sanitizePosts(posts).filter(post => isPostVisibleToViewer(post, viewer));
}

async function resolveStorage() {
  try {
    const db = await getMongoDb();

    if (!db) {
      return {
        db: null,
        storage: "memory",
        warning: "MongoDB is not configured yet. SharePass is using in-memory storage, so feed updates are only local to this running session.",
      };
    }

    await ensurePostStorageSetup(db);

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
    try {
      const viewer = normalizeViewerIdentity(req.query);

      if (db) {
        const posts = await db
          .collection(getMongoCollectionName())
          .find({}, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();

        const legacyDemoPostIds = posts
          .filter(post => LEGACY_DEMO_POST_IDS.includes(String(post.id)))
          .map(post => String(post.id));

        if (legacyDemoPostIds.length > 0) {
          await db.collection(getMongoCollectionName()).deleteMany({ id: { $in: legacyDemoPostIds } });
        }

        return res.status(200).json({
          posts: filterVisiblePosts(posts, viewer),
          storage,
          warning,
        });
      }
    } catch (error) {
      console.error("Post feed loading fell back to memory", error);
      const viewer = normalizeViewerIdentity(req.query);

      return res.status(200).json({
        posts: filterVisiblePosts(localPosts, viewer),
        storage: "memory",
        warning: mergeWarnings(
          warning,
          "MongoDB read failed, so SharePass returned in-memory posts for this session.",
        ),
      });
    }

    const viewer = normalizeViewerIdentity(req.query);

    return res.status(200).json({
      posts: filterVisiblePosts(localPosts, viewer),
      storage,
      warning,
    });
  }

  try {
    const parsedBody = readJsonObjectBody(req);

    if (!parsedBody.ok) {
      return res.status(400).json({ error: parsedBody.error });
    }

    const body = parsedBody.body;
    const content = String(body.content || "").trim();
    const reflection = String(body.reflection || "").trim();
    const emotion = String(body.emotion || "").trim();
    const visibility = String(body.visibility || "public").trim();
    const username = String(body.username || "").trim();
    const authorId = cleanString(body.authorId);

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
      username,
      authorId,
    });

    if (db) {
      try {
        await db.collection(getMongoCollectionName()).insertOne(post);
      } catch (error) {
        console.error("Post persistence fell back to memory", error);
        localPosts = sanitizePosts([post, ...localPosts]);

        return res.status(201).json({
          post,
          storage: "memory",
          warning: mergeWarnings(
            warning,
            "MongoDB write failed, so SharePass saved this post in local in-memory storage for now.",
          ),
        });
      }
    } else {
      localPosts = sanitizePosts([post, ...localPosts]);
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
