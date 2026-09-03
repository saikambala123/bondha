/**
 * POST /api/resume/parse — multipart resume upload → text extraction →
 * AI (Gemini / fallback) structured parsing → stored as the user's profile.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getCurrentUserId } from "@/lib/session";
import { extractResumeText } from "@/lib/resume";
import { parseResumeText, activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
    let pages = 0;
    try {
      const extracted = await extractResumeText(buffer, file.name, file.type);
      text = extracted.text;
      pages = extracted.pages;
    } catch (err) {
      return NextResponse.json(
        { error: `Could not read file: ${err instanceof Error ? err.message : "unsupported format"}` },
        { status: 422 },
      );
    }

    if (text.replace(/\s+/g, "").length < 80) {
      return NextResponse.json(
        { error: "Extracted text is too short to be a resume (scanned/image PDFs are not supported yet)" },
        { status: 422 },
      );
    }

    const parsed = await parseResumeText(text, file.name);
    if (!parsed || !parsed.fullName) {
      return NextResponse.json(
        { error: "AI parsing failed — try again or fill the profile manually" },
        { status: 502 },
      );
    }

    const { resumes, profiles, activity } = await getCollections();
    const now = new Date();

    const resumeDoc = {
      userId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      pages,
      textLength: text.length,
      provider: activeProvider(),
      createdAt: now,
    };
    const resumeResult = await resumes.insertOne(resumeDoc);

    // Deactivate previous profiles, insert the freshly parsed one as active.
    await profiles.updateMany({ userId }, { $set: { active: false } });
    const profileDoc = {
      userId,
      active: true,
      ...parsed,
      source: "ai-parse",
      resumeId: String(resumeResult.insertedId),
      createdAt: now,
      updatedAt: now,
    };
    const profileResult = await profiles.insertOne(profileDoc);

    await resumes.updateOne(
      { _id: resumeResult.insertedId },
      { $set: { profileId: String(profileResult.insertedId) } },
    );

    await activity.insertOne({
      userId,
      type: "resume_parsed",
      message: `Parsed resume "${file.name}" → profile for ${parsed.fullName}`,
      meta: { provider: activeProvider(), skills: (parsed.skills || []).length },
      createdAt: now,
    });

    return NextResponse.json({ ok: true, profile: { ...profileDoc, _id: profileResult.insertedId }, provider: activeProvider() });
  } catch (err) {
     
    console.error("[resume/parse]", err);
    return NextResponse.json({ error: "Internal error while parsing resume" }, { status: 500 });
  }
}
