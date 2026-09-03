/**
 * POST /api/ext/handshake — extension validates its API key and fetches the
 * profile snapshot + portal info. Called when the popup opens / connects.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getUserIdFromApiKey } from "@/lib/session";
import { activeProvider, geminiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromApiKey(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const { profiles, apiKeys } = await getCollections();
  const profile = await profiles.findOne({ userId, active: true });

  await apiKeys.updateOne(
    { userId, revoked: { $ne: true } },
    { $set: { lastUsedAt: new Date() } },
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    aiProvider: activeProvider(),
    geminiConfigured: geminiConfigured(),
    profile: profile
      ? {
          fullName: profile.fullName,
          email: profile.email,
          headline: profile.desiredRole || "",
          skills: (profile.skills || []).slice(0, 8),
          updatedAt: profile.updatedAt,
        }
      : null,
  });
}
