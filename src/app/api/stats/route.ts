/**
 * GET /api/stats — dashboard KPIs + recent activity + recent sessions in one call.
 */
import { NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId } from "@/lib/session";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const { profiles, resumes, sessions, activity, apiKeys } = await getCollections();

  const [profile, resumeCount, sessionDocs, activityDocs, keyCount] = await Promise.all([
    profiles.findOne({ userId, active: true }),
    resumes.countDocuments({ userId }),
    sessions.find({ userId }).sort({ startedAt: -1 }).limit(25).toArray(),
    activity.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
    apiKeys.countDocuments({ userId, revoked: { $ne: true } }),
  ]);

  const totalFields = sessionDocs.reduce((sum, s) => sum + (s.fieldCount || 0), 0);
  const totalFilled = sessionDocs.reduce((sum, s) => sum + (s.filledCount || 0), 0);
  const totalErrors = sessionDocs.reduce((sum, s) => sum + (s.errors?.length || 0), 0);
  const totalFixes = sessionDocs.reduce((sum, s) => sum + (s.fixes?.length || 0), 0);

  return NextResponse.json({
    hasProfile: Boolean(profile),
    profileName: profile?.fullName || null,
    resumeCount,
    sessionCount: sessionDocs.length,
    keyCount,
    aiProvider: activeProvider(),
    kpis: {
      fieldsDetected: totalFields,
      fieldsFilled: totalFilled,
      errorsDetected: totalErrors,
      autoFixes: totalFixes,
      successRate: totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0,
    },
    sessions: sessionDocs,
    activity: activityDocs,
  });
}
