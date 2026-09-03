/**
 * ApplyPilot — MongoDB connection layer
 *
 * Production (Vercel): set MONGODB_URI to your MongoDB Atlas connection string.
 * Sandbox / local preview: when MONGODB_URI is absent, we boot a real in-memory
 * MongoDB (mongodb-memory-server) so the app is fully functional with zero config.
 * No custom database is ever used — this is genuine MongoDB end to end.
 */

import { MongoClient, type Db, type Collection } from "mongodb";

const DB_NAME = "applypilot";

interface Collections {
  users: Collection;
  profiles: Collection;
  resumes: Collection;
  apiKeys: Collection;
  sessions: Collection;
  activity: Collection;
}

declare global {
   
  var __applypilotMongo: Promise<MongoClient> | undefined;
}

async function createClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (uri && uri.trim().length > 0) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      appName: "ApplyPilot",
    });
    await client.connect();
    return client;
  }

  // Fallback for sandbox preview: real MongoDB binary running in-memory.
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mem = await MongoMemoryServer.create({
    instance: { dbName: DB_NAME },
  });
  const client = new MongoClient(mem.getUri(DB_NAME), {
    serverSelectionTimeoutMS: 15000,
  });
  await client.connect();
   
  console.log("[ApplyPilot] Using in-memory MongoDB (set MONGODB_URI for production)");
  return client;
}

export function mongoClient(): Promise<MongoClient> {
  if (!global.__applypilotMongo) {
    global.__applypilotMongo = createClient().catch((err) => {
      global.__applypilotMongo = undefined;
      throw err;
    });
  }
  return global.__applypilotMongo;
}

export async function getDb(): Promise<Db> {
  const client = await mongoClient();
  return client.db(DB_NAME);
}

export async function getCollections(): Promise<Collections> {
  const db = await getDb();
  return {
    users: db.collection("users"),
    profiles: db.collection("profiles"),
    resumes: db.collection("resumes"),
    apiKeys: db.collection("api_keys"),
    sessions: db.collection("fill_sessions"),
    activity: db.collection("activity"),
  };
}

/** Ensure helpful indexes (idempotent). */
let indexed = false;
export async function ensureIndexes(): Promise<void> {
  if (indexed) return;
  const { users, profiles, resumes, apiKeys, sessions, activity } = await getCollections();
  await Promise.all([
    users.createIndex({ anonId: 1 }, { unique: true }),
    profiles.createIndex({ userId: 1 }),
    profiles.createIndex({ userId: 1, active: -1 }),
    resumes.createIndex({ userId: 1, createdAt: -1 }),
    apiKeys.createIndex({ keyHash: 1 }, { unique: true }),
    apiKeys.createIndex({ userId: 1 }),
    sessions.createIndex({ userId: 1, startedAt: -1 }),
    activity.createIndex({ userId: 1, createdAt: -1 }),
  ]);
  indexed = true;
}
