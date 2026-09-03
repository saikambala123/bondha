import { NextResponse } from "next/server";
import { activeProvider, geminiConfigured } from "@/lib/ai";
import { ensureIndexes } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureIndexes();
    return NextResponse.json({
      ok: true,
      db: "mongodb",
      aiProvider: activeProvider(),
      geminiConfigured: geminiConfigured(),
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
