/**
 * POST /api/ext/report — extension reports the result of a fill session,
 * including fields it filled, fields it skipped, and validation errors it
 * auto-detected (before + after submission attempt).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getUserIdFromApiKey } from "@/lib/session";

export const dynamic = "force-dynamic";

interface ReportBody {
  url?: string;
  platform?: string;
  fieldCount?: number;
  filledCount?: number;
  skipped?: Array<{ label?: string; reason?: string }>;
  errors?: Array<{ fieldLabel?: string; message?: string; severity?: string; source?: string }>;
  fixes?: Array<{ fieldLabel?: string; oldValue?: string; newValue?: string }>;
  status?: "completed" | "partial" | "failed";
  durationMs?: number;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromApiKey(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessions, activity } = await getCollections();
  const now = new Date();

  const doc = {
    userId,
    url: (body.url || "").slice(0, 1000),
    platform: body.platform || "Unknown",
    fieldCount: body.fieldCount ?? 0,
    filledCount: body.filledCount ?? 0,
    skipped: (body.skipped || []).slice(0, 50),
    errors: (body.errors || []).slice(0, 50),
    fixes: (body.fixes || []).slice(0, 50),
    status: body.status || (body.errors?.length ? "partial" : "completed"),
    durationMs: body.durationMs ?? 0,
    startedAt: now,
  };
  const result = await sessions.insertOne(doc);

  await activity.insertOne({
    userId,
    type: "fill_session",
    message: `Autofill on ${doc.platform}: ${doc.filledCount}/${doc.fieldCount} fields${
      doc.errors.length ? `, ${doc.errors.length} issue(s) detected` : ", no errors detected"
    }`,
    meta: { sessionId: String(result.insertedId), status: doc.status, url: doc.url },
    createdAt: now,
  });

  return NextResponse.json({ ok: true, sessionId: String(result.insertedId) });
}
