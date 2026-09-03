/**
 * POST /api/ext/autofill — the core extension endpoint.
 * Receives form field descriptors scraped from a job application page,
 * maps them to the candidate profile with AI (Gemini), and returns
 * per-field fill decisions with confidence scores.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/mongo";
import { getUserIdFromApiKey } from "@/lib/session";
import { mapFieldsToProfile, generateAnswer, type FieldDescriptor, type FillDecision } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const QUESTION_MIN_LEN = 24; // labels longer than this may be open-ended questions

interface AutofillBody {
  url?: string;
  fields?: FieldDescriptor[];
  jobDescription?: string;
  generateAnswers?: boolean;
}

function platformFromUrl(url: string): { platform: string; hostname: string } {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { platform: "unknown", hostname: url.slice(0, 60) };
  }
  const h = hostname.toLowerCase();
  if (h.includes("myworkday") || h.includes("workday")) return { platform: "Workday", hostname };
  if (h.includes("greenhouse")) return { platform: "Greenhouse", hostname };
  if (h.includes("lever.co")) return { platform: "Lever", hostname };
  if (h.includes("ashbyhq")) return { platform: "Ashby", hostname };
  if (h.includes("smartrecruiters")) return { platform: "SmartRecruiters", hostname };
  if (h.includes("taleo")) return { platform: "Oracle Taleo", hostname };
  if (h.includes("icims") || h.includes("jobs2web")) return { platform: "iCIMS", hostname };
  if (h.includes("successfactors") || h.includes("sap")) return { platform: "SAP SuccessFactors", hostname };
  if (h.includes("jobvite")) return { platform: "Jobvite", hostname };
  if (h.includes("bamboohr")) return { platform: "BambooHR", hostname };
  if (h.includes("linkedin")) return { platform: "LinkedIn", hostname };
  if (h.includes("indeed")) return { platform: "Indeed", hostname };
  return { platform: "Generic ATS", hostname };
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const userId = await getUserIdFromApiKey(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  let body: AutofillBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fields = Array.isArray(body.fields) ? body.fields.slice(0, 120) : [];
  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields provided" }, { status: 400 });
  }

  const { profiles, activity } = await getCollections();
  const profile = await profiles.findOne({ userId, active: true });
  if (!profile) {
    return NextResponse.json({ error: "No profile yet — upload a resume in the portal first" }, { status: 404 });
  }

  const url = body.url || "";
  const jobContext = {
    url,
    platform: platformFromUrl(url).platform,
    jobDescription: body.jobDescription,
  };

  // 1) Map structured fields
  const fills = await mapFieldsToProfile(fields as FieldDescriptor[], profile, jobContext);

  // 2) For low-confidence, long free-text fields that look like questions → generate an answer
  if (body.generateAnswers !== false) {
    const weak = fills.filter(
      (f: FillDecision) =>
        (!f.value || f.confidence < 0.4) && (f.source === undefined || f.source === ""),
    );
    const questionFields = fields.filter((fd) => {
      const decision = fills.find((f) => f.fieldId === fd.fieldId);
      const noValue = !decision || !decision.value || decision.confidence < 0.4;
      const looksLikeQuestion =
        (fd.type === "textarea" || QUESTION_MIN_LEN < (fd.label?.length ?? 0)) &&
        (fd.type === "textarea" || /(\?|why|describe|tell us|explain|what|how do you|cover)/i.test(fd.label || ""));
      return noValue && looksLikeQuestion && fd.type !== "checkbox" && fd.type !== "radio";
    });

    for (const fd of questionFields.slice(0, 3)) {
      try {
        const answer = await generateAnswer(fd.label || "Tell us about yourself", profile, jobContext, fd.maxLength);
        if (answer) {
          const decision = fills.find((f) => f.fieldId === fd.fieldId);
          if (decision) {
            decision.value = answer;
            decision.confidence = 0.75;
            decision.source = "generated";
          } else {
            fills.push({ fieldId: fd.fieldId, value: answer, confidence: 0.75, source: "generated" });
          }
        }
      } catch {
        // keep going — a missing generated answer is non-fatal
      }
    }
    void weak;
  }

  const { activity: _a, ...safeProfile } = profile;
  void _a;

  await activity.insertOne({
    userId,
    type: "autofill_requested",
    message: `AI mapped ${fills.filter((f) => f.value).length}/${fields.length} fields on ${jobContext.platform}`,
    meta: { url: url.slice(0, 300), platform: jobContext.platform, latencyMs: Date.now() - started },
    createdAt: new Date(),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    platform: jobContext.platform,
    profileName: profile.fullName || "Candidate",
    fills,
    latencyMs: Date.now() - started,
  });
}
