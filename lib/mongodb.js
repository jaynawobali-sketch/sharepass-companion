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
    const client = new MongoClient(uri);
    cache.promise = client.connect().then(connectedClient => {
      cache.client = connectedClient;
      return connectedClient;
    });
  }

  const client = cache.client || (await cache.promise);
  return client.db(dbName);
}
