/**
 * GET  /api/profile — active profile for the current session
 * PUT  /api/profile — update the active profile (manual edits)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const { profiles } = await getCollections();
  const profile = await profiles.findOne({ userId, active: true });
  return NextResponse.json({ profile: profile ?? null });
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const { profiles, activity } = await getCollections();

    const allowed = [
      "fullName", "email", "phone", "location", "links", "summary",
      "desiredRole", "workAuthorization", "yearsOfExperience",
      "education", "experience", "skills", "certifications", "languages",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    updates.updatedAt = new Date();

    const existing = await profiles.findOne({ userId, active: true }, { projection: { _id: 1 } });
    const created = !existing;

    const result = await profiles.findOneAndUpdate(
      { userId, active: true },
      {
        $set: updates,
        ...(created
          ? { $setOnInsert: { userId, active: true, source: "manual", createdAt: new Date() } }
          : {}),
      },
      { upsert: true, returnDocument: "after" },
    );

    await activity.insertOne({
      userId,
      type: created ? "profile_created" : "profile_updated",
      message: created ? "Profile created manually" : "Profile edited manually",
      meta: { fields: Object.keys(updates).filter((k) => k !== "updatedAt") },
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, profile: result });
  } catch (err) {
     
    console.error("[profile/PUT]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
