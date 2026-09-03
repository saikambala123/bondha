# ⚡ ApplyPilot — AI Job Application Autofill Portal + Chrome Extension

Full-stack AI platform that **auto-fills job applications** on Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Taleo, iCIMS, SuccessFactors, BambooHR, LinkedIn, Indeed and **any generic ATS form** — and **auto-detects errors** in the filled form before you submit.

- **Web portal**: Next.js 16 (App Router) + Tailwind + shadcn/ui — resume upload, AI-parsed profile editor, application history, API key management, deploy guide.
- **Chrome extension** (Manifest V3): form detection, AI field mapping, framework-safe filling, validation engine with AI auto-repair, live on-page report.
- **Backend**: **MongoDB only** (native driver) — Atlas in production, in-memory MongoDB for zero-config local preview. No custom/other database.
- **AI**: **Google Gemini API** (`gemini-2.5-flash`) for resume parsing, field mapping, open-ended question answers and error repairs. A built-in fallback engine keeps everything working even without a key.

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────────┐
│  Chrome Extension   │  Bearer │   Next.js 16 (Vercel)        │
│  content.js         │────────▶│  /api/ext/autofill  ────────▶ Gemini / fallback AI
│  · scan fields      │  API key│  /api/ext/repair             │
│  · fill + validate  │◀────────│  /api/resume/parse           │
│  · error detection  │         │  /api/profile /keys /stats   │
└─────────────────────┘         └──────────────┬───────────────┘
                                               │ native driver
                                        ┌──────▼───────┐
                                        │   MongoDB    │
                                        │ users, profiles, resumes, │
                                        │ api_keys, fill_sessions,  │
                                        │ activity                  │
                                        └──────────────┘
```

## Quick start (local / sandbox preview)

```bash
bun install
bun run dev        # http://localhost:3000
```

With no `MONGODB_URI` set, a real **in-memory MongoDB** boots automatically so you can try every feature instantly. To persist data, run MongoDB and set `MONGODB_URI` in `.env`.

## Deploy to Vercel

1. **MongoDB Atlas** — create a free M0 cluster + database user + network access `0.0.0.0/0`. Copy the SRV string.
2. **Gemini key** — get one at https://aistudio.google.com/apikey (free tier works).
3. **Deploy**:
   ```bash
   vercel                                   # link the repo
   vercel env add MONGODB_URI production
   vercel env add GEMINI_API_KEY production
   vercel --prod
   ```
   Or via the dashboard: push to GitHub → vercel.com/new → add the two env vars → Deploy.
4. **Extension → production**: open the deployed portal → *Extension* tab → create an API key → paste the portal URL + key into the extension popup → Connect.

Full guide is also built into the portal's **Deploy** tab.

## Install the extension

1. Download `https://<your-deployment>/extension.zip` (also in `download/applypilot-extension.zip`) and unzip.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the folder.
3. Click the ApplyPilot icon → set portal URL + API key → **Connect**.
4. Open any job application → the floating **⚡ AI Autofill** button appears (or use the popup button).

## How the error auto-detection works

- **Pre-submit validation**: required-empty, email/phone/URL/ZIP format, number min/max, max-length, `aria-invalid` flags.
- **Platform banners**: Workday (`data-automation-id` errors), Greenhouse, and generic `[role=alert]`/error-class scans with text heuristics ("required", "enter a valid", "can't be blank"…).
- **AI repair loop**: detected errors are sent to `/api/ext/repair`; Gemini suggests corrected values, the extension re-fills and re-validates (2 rounds), and the whole session is reported to the portal (Applications tab).

## API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/resume/parse` | cookie | PDF/DOCX/TXT → Gemini → structured profile |
| `GET/PUT /api/profile` | cookie | read / edit active profile |
| `GET/POST /api/keys`, `DELETE /api/keys/:id` | cookie | extension API keys (SHA-256 hashed) |
| `POST /api/ext/handshake` | Bearer key | validate key, fetch profile snapshot |
| `POST /api/ext/autofill` | Bearer key | map page fields → profile values (AI) |
| `POST /api/ext/repair` | Bearer key | fix a field that failed validation (AI) |
| `POST /api/ext/report` | Bearer key | store fill session + detected errors |
| `GET /api/stats` · `/api/sessions` | cookie | dashboard & history |

## Notes

- Resume files supported: **PDF, DOCX, TXT/MD** (≤ 8MB). Scanned image-only PDFs are rejected (no OCR).
- Extension fill uses native value setters + input/change events → compatible with React (Workday/Greenhouse), Angular and vanilla forms.
- All extension traffic is proxied through the background service worker (host permissions), so job-site CORS never interferes.
