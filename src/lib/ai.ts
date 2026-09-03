/**
 * ApplyPilot AI service.
 *
 * Primary engine: Google Gemini API (gemini-2.5-flash) — activated when
 * GEMINI_API_KEY (or GOOGLE_API_KEY) is present in the environment.
 * Fallback engine: built-in Z.ai SDK — keeps the sandbox preview fully working
 * without a Gemini key, and acts as an automatic resilience layer in production.
 *
 * All three product capabilities live here:
 *  1. parseResumeText   — resume → structured profile JSON
 *  2. mapFieldsToProfile — form field descriptors → values from the profile
 *  3. generateAnswer    — open-ended application questions → tailored answer
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function activeProvider(): "gemini" | "zai-fallback" {
  return geminiConfigured() ? "gemini" : "zai-fallback";
}

/** Extract the first valid JSON object/array from arbitrary LLM text. */
function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function callGemini(system: string, user: string, maxTokens = 4096): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!res.ok) {
       
      console.error("[ApplyPilot] Gemini API error:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((p: { text?: string }) => p?.text ?? "").join("");
  } catch (err) {
     
    console.error("[ApplyPilot] Gemini request failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callFallback(system: string, user: string): Promise<string | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content ?? null;
  } catch (err) {
     
    console.error("[ApplyPilot] Fallback AI failed:", err);
    return null;
  }
}

/** Ask the AI engine for JSON and parse it. Tries Gemini first, then fallback. */
async function askJson<T>(system: string, user: string, maxTokens?: number): Promise<T | null> {
  let raw = await callGemini(system, user, maxTokens);
  let parsed = raw ? extractJson<T>(raw) : null;
  if (parsed) return parsed;
  raw = await callFallback(system, user);
  parsed = raw ? extractJson<T>(raw) : null;
  return parsed;
}

// ---------------------------------------------------------------------------
// 1) Resume parsing
// ---------------------------------------------------------------------------

export interface ParsedProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: { linkedin: string; github: string; portfolio: string; website: string };
  summary: string;
  desiredRole: string;
  workAuthorization: string;
  yearsOfExperience: string;
  education: Array<{ degree: string; school: string; field: string; startYear: string; endYear: string; gpa: string }>;
  experience: Array<{ company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; description: string }>;
  skills: string[];
  certifications: string[];
  languages: string[];
}

const RESUME_SYSTEM = `You are an expert resume parser for job-application autofill systems.
Extract candidate data from the resume text and return ONLY a JSON object matching this exact schema (use "" for unknown strings, [] for unknown arrays, and false for unknown booleans — never invent facts):
{
  "fullName": "", "email": "", "phone": "", "location": "",
  "links": { "linkedin": "", "github": "", "portfolio": "", "website": "" },
  "summary": "", "desiredRole": "", "workAuthorization": "", "yearsOfExperience": "",
  "education": [{ "degree": "", "school": "", "field": "", "startYear": "", "endYear": "", "gpa": "" }],
  "experience": [{ "company": "", "title": "", "location": "", "startDate": "", "endDate": "", "current": false, "description": "" }],
  "skills": [], "certifications": [], "languages": []
}
Dates should keep the format used in the resume (e.g. "Jan 2020"). "summary" is a 2-3 sentence professional summary written in third person-neutral tone based on the resume.`;

export async function parseResumeText(text: string, fileName: string): Promise<ParsedProfile | null> {
  const clipped = text.slice(0, 60_000);
  const user = `File name: ${fileName}\n\nRESUME TEXT:\n"""\n${clipped}\n"""`;
  return askJson<ParsedProfile>(RESUME_SYSTEM, user, 8192);
}

// ---------------------------------------------------------------------------
// 2) Field mapping for autofill
// ---------------------------------------------------------------------------

export interface FieldDescriptor {
  fieldId: string;
  type: string; // text | email | tel | url | date | select | textarea | radio | checkbox | number | month
  label: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  ariaLabel?: string;
  maxLength?: number;
}

export interface FillDecision {
  fieldId: string;
  value: string;
  confidence: number; // 0..1
  source: string; // e.g. "profile.email", "generated"
}

const MAP_SYSTEM = `You are an AI autofill engine that maps job-application form fields to a candidate profile.
Rules:
- Use ONLY values present in the profile. Never fabricate identities, dates, or contact info.
- For select/radio fields pick the BEST matching option (case-insensitive, fuzzy). If no option reasonably matches, set value to "" and confidence to 0.
- For checkbox fields: value "check" or "uncheck". Volunteer/demographic/EEA-style optional survey questions should be "uncheck" unless the profile clearly indicates otherwise.
- confidence: 1 = exact profile data, 0.5-0.9 = good fuzzy match, 0 = no safe value.
- If a field cannot be filled safely, return value "" with confidence 0 and a short reason.
Return ONLY JSON: { "fills": [{ "fieldId": "", "value": "", "confidence": 0, "source": "profile.<key>" | "generated", "reason": "" }] }
Every input fieldId MUST appear exactly once in fills.`;

export async function mapFieldsToProfile(
  fields: FieldDescriptor[],
  profile: Record<string, unknown>,
  jobContext: { url: string; platform: string; jobDescription?: string },
): Promise<FillDecision[]> {
  const slimProfile: Record<string, unknown> = { ...profile };
  delete slimProfile._id;
  delete slimProfile.userId;
  delete slimProfile.createdAt;
  delete slimProfile.updatedAt;
  delete slimProfile.active;
  delete slimProfile.source;

  const user = `TARGET SITE: ${jobContext.platform} (${jobContext.url})
${jobContext.jobDescription ? `JOB DESCRIPTION (truncated):\n"""\n${jobContext.jobDescription.slice(0, 4000)}\n"""` : ""}

CANDIDATE PROFILE JSON:
${JSON.stringify(slimProfile, null, 1)}

FORM FIELDS (${fields.length}):
${JSON.stringify(fields, null, 1)}`;

  const result = await askJson<{ fills: FillDecision[] }>(MAP_SYSTEM, user, 8192);
  return result?.fills ?? [];
}

// ---------------------------------------------------------------------------
// 3) Open-ended question answering
// ---------------------------------------------------------------------------

export async function generateAnswer(
  question: string,
  profile: Record<string, unknown>,
  jobContext: { url: string; platform: string; jobDescription?: string },
  maxLength?: number,
): Promise<string> {
  const system = `You are ApplyPilot, an assistant that drafts concise, authentic-sounding answers to job-application questions on behalf of a candidate.
- Ground every claim in the candidate profile only; never invent employers, degrees, numbers, or dates.
- Tone: professional, specific, 1st person. No clichés like "I am passionate about".
- Respect the maximum length strictly. Return ONLY JSON: { "answer": "" }`;

  const user = `Question: "${question}"
Max length: ${maxLength ?? 600} characters.
Target: ${jobContext.platform} (${jobContext.url})
${jobContext.jobDescription ? `JOB DESCRIPTION (truncated):\n"""\n${jobContext.jobDescription.slice(0, 3000)}\n"""` : ""}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 1)}`;

  const result = await askJson<{ answer: string }>(system, user, 2048);
  return (result?.answer ?? "").trim();
}

// ---------------------------------------------------------------------------
// 4) Error-repair suggestions
// ---------------------------------------------------------------------------

export async function suggestFieldFix(
  field: FieldDescriptor,
  error: string,
  currentValue: string,
  profile: Record<string, unknown>,
): Promise<string> {
  const system = `You fix form fields that failed validation on a job application.
Return ONLY JSON: { "value": "" } with the best corrected value based strictly on the profile, or { "value": "" } if unfixable.`;
  const user = `Field label: "${field.label}" (type: ${field.type})
Validation error: "${error}"
Rejected value: "${currentValue}"
Profile: ${JSON.stringify(profile)}
${field.options ? `Allowed options: ${JSON.stringify(field.options)}` : ""}`;
  const result = await askJson<{ value: string }>(system, user, 1024);
  return (result?.value ?? "").trim();
}
