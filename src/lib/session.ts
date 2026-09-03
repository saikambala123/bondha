/**
 * Anonymous cookie-session helpers.
 * Every browser gets an httpOnly session cookie mapped to a MongoDB user doc.
 * The Chrome extension instead authenticates with an API key (Bearer token).
 */
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { getCollections, ensureIndexes } from "./mongo";

export const SESSION_COOKIE = "ap_sid";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

/** Resolve (or lazily create) the current user from the session cookie. */
export async function getCurrentUserId(): Promise<string> {
  await ensureIndexes();
  const store = await cookies();
  let sid = store.get(SESSION_COOKIE)?.value;

  const { users } = await getCollections();

  if (sid) {
    const existing = await users.findOne({ anonId: sid });
    if (existing) return String(existing._id);
  }

  sid = newId("sid");
  const inserted = await users.insertOne({
    anonId: sid,
    createdAt: new Date(),
    plan: "free",
  });

  try {
    store.set(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // cookies().set can throw when called outside a mutation scope; safe to ignore.
  }
  return String(inserted.insertedId);
}

/** Generate a displayable API key for the extension. */
export function generateApiKey(): string {
  return `ap_live_${randomBytes(20).toString("hex")}`;
}

/** Hash an API key for storage/lookup. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Authenticate an extension request via Authorization: Bearer <api key>. */
export async function getUserIdFromApiKey(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const key = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("ap_live_")) return null;
  await ensureIndexes();
  const { apiKeys } = await getCollections();
  const doc = await apiKeys.findOne({ keyHash: hashApiKey(key), revoked: { $ne: true } });
  return doc ? String(doc.userId) : null;
}
