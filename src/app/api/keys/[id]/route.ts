/**
 * DELETE /api/keys/[id] — revoke an API key.
 * Returns the full key value once on creation so it can be pasted into the
 * extension popup; the extension stores it in chrome.storage.local.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId();
  const { apiKeys } = await getCollections();

  const { ObjectId } = await import("mongodb");
  let oid: InstanceType<typeof ObjectId>;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });
  }

  const result = await apiKeys.updateOne(
    { _id: oid, userId },
    { $set: { revoked: true, revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
