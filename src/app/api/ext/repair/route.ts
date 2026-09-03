/**
 * POST /api/ext/repair — when the extension's validator detects an error on a
 * filled field, this endpoint asks the AI for a corrected value.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getUserIdFromApiKey } from "@/lib/session";
import { suggestFieldFix, type FieldDescriptor } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RepairBody {
  field: FieldDescriptor;
  error: string;
  currentValue?: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromApiKey(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  let body: RepairBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.field || !body.error) {
    return NextResponse.json({ error: "field and error are required" }, { status: 400 });
  }

  const { profiles } = await getCollections();
  const profile = await profiles.findOne({ userId, active: true });
  if (!profile) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }

  const value = await suggestFieldFix(
    body.field,
    body.error,
    body.currentValue ?? "",
    profile,
  );

  return NextResponse.json({
    ok: true,
    value,
    repaired: Boolean(value),
  });
}
