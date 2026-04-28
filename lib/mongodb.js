import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

function getMongoConfig() {
  return {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB,
  };
}

export function isMongoConfigured() {
  const { uri, dbName } = getMongoConfig();
  return Boolean(uri && dbName);
}

export function getMongoCollectionName() {
  return process.env.MONGODB_COLLECTION_POSTS || "posts";
}

export async function getMongoDb() {
  const { uri, dbName } = getMongoConfig();

  if (!uri || !dbName) {
    return null;
  }

  if (!globalForMongo.__sharepassMongo) {
    globalForMongo.__sharepassMongo = {
      client: null,
      promise: null,
    };
  }

  const cache = globalForMongo.__sharepassMongo;

  if (!cache.promise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500,
      maxPoolSize: 10,
    });
    cache.promise = client.connect()
      .then(connectedClient => {
        cache.client = connectedClient;
        return connectedClient;
      })
      .catch(error => {
        cache.promise = null;
        throw error;
      });
  }

  const client = cache.client || (await cache.promise);
  return client.db(dbName);
}

export async function warmMongoConnection({ strict = false } = {}) {
  const { uri, dbName } = getMongoConfig();

  if (!uri || !dbName) {
    return { ok: false, configured: false, error: "Mongo is not configured." };
  }

  try {
    await getMongoDb();
    return { ok: true, configured: true, error: "" };
  } catch (error) {
    const message = error?.message || String(error || "Mongo connection failed.");

    if (strict) {
      throw error;
    }

    return { ok: false, configured: true, error: message };
  }
}
