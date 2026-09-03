/**
 * GET /api/sessions — fill-session history for the Applications tab.
 */
import { NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const { sessions } = await getCollections();
  const docs = await sessions
    .find({ userId })
    .sort({ startedAt: -1 })
    .limit(60)
    .toArray();
  return NextResponse.json({ sessions: docs });
}
