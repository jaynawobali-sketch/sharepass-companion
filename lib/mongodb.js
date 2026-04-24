import { createRequire } from "module";

const globalForMongo = globalThis;
const nodeRequire = createRequire(`${process.cwd()}/package.json`);

function getMongoPackage() {
  try {
    return nodeRequire("mongodb");
  } catch {
    return null;
  }
}

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

  const mongoPackage = getMongoPackage();

  if (!mongoPackage?.MongoClient) {
    throw new Error("MongoDB env vars are set, but the mongodb package is not installed yet. Run npm install mongodb.");
  }

  if (!globalForMongo.__sharepassMongo) {
    globalForMongo.__sharepassMongo = {
      client: null,
      promise: null,
    };
  }

  const cache = globalForMongo.__sharepassMongo;

  if (!cache.promise) {
    const client = new mongoPackage.MongoClient(uri);
    cache.promise = client.connect().then(connectedClient => {
      cache.client = connectedClient;
      return connectedClient;
    });
  }

  const client = cache.client || (await cache.promise);
  return client.db(dbName);
}
