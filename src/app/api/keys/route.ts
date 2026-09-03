/**
 * GET  /api/keys — list API keys for the extension
 * POST /api/keys — create a new key
 */
import { NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId, generateApiKey, hashApiKey } from "@/lib/session";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const { apiKeys } = await getCollections();
  const keys = await apiKeys
    .find({ userId }, { projection: { keyHash: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  return NextResponse.json({ keys, aiProvider: activeProvider() });
}

export async function POST() {
  const userId = await getCurrentUserId();
  const { apiKeys, activity } = await getCollections();

  const existing = await apiKeys.countDocuments({ userId, revoked: { $ne: true } });
  if (existing >= 5) {
    return NextResponse.json({ error: "Key limit reached (5) — revoke one first" }, { status: 429 });
  }

  const key = generateApiKey();
  const now = new Date();
  const doc = {
    userId,
    key,
    keyHash: hashApiKey(key),
    label: `Extension key ${existing + 1}`,
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
  };
  const result = await apiKeys.insertOne(doc);

  await activity.insertOne({
    userId,
    type: "key_created",
    message: "New extension API key created",
    meta: { keyId: String(result.insertedId) },
    createdAt: now,
  });

  return NextResponse.json({ ok: true, key: { ...doc, _id: result.insertedId } });
}
