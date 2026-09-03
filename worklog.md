# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build "ApplyPilot" — full-stack AI job-application autofill web portal + Chrome extension (MongoDB backend, Gemini resume parsing, Vercel-ready)

Work Log:
- Initialized fullstack dev environment (Next.js 16 + TS + Tailwind 4 + shadcn/ui)
- Installed mongodb, mongodb-memory-server (sandbox fallback), pdf-parse v2, mammoth
- Data layer: `src/lib/mongo.ts` — native MongoDB driver; production uses MONGODB_URI (Atlas), sandbox auto-boots in-memory MongoDB; indexes ensured via `src/instrumentation.ts`
- Auth: anonymous cookie sessions (`src/lib/session.ts`) + SHA-256-hashed API keys with Bearer auth for the extension
- AI service: `src/lib/ai.ts` — Gemini REST (gemini-2.5-flash, JSON response mode) with automatic Z.ai SDK fallback; capabilities: resume parsing, field→profile mapping, open-ended answer generation, error repair
- API routes: /api/health, /api/resume/parse, /api/profile (GET/PUT), /api/keys (GET/POST), /api/keys/[id] (DELETE), /api/ext/handshake, /api/ext/autofill, /api/ext/repair, /api/ext/report, /api/stats, /api/sessions
- Portal UI (single route `/`): dashboard (KPIs, setup checklist, activity feed), resume upload + parse steps + full profile editor (contact, links, summary, skills/certs/languages tag editors, experience & education cards), applications history (sessions with detected errors & AI repairs), extension tab (key mgmt, install guide, platform matrix), deploy tab (Vercel + Atlas + Gemini guide)
- Dark emerald theme in globals.css; custom scrollbars; ambient glow; sticky footer; mobile nav
- Chrome extension (MV3) in `extension/`: background.js service worker (all portal traffic, settings in chrome.storage), content.js (platform detection for Workday/Greenhouse/Lever/Ashby/SmartRecruiters/Taleo/iCIMS/SF/BambooHR/Jobvite/LinkedIn/Indeed/generic; label resolution incl. Workday data-automation-id; framework-safe native setters; validation engine: required/email/phone/zip/URL/number/maxLength/aria-invalid + platform error-banner scanning; 2-round AI repair loop; Shadow-DOM floating widget with live steps + report), popup.html/js/css (connect portal URL + key, autofill trigger, last session)
- Icons generated via scripts/gen_icons.py; extension zipped to public/extension.zip + download/applypilot-extension.zip
- Vercel config: vercel.json (function maxDurations), .env.example, README.md with deploy guide
- Verification: lint clean (auto-fixed warnings); curl-tested health/parse/keys/handshake/autofill/report/stats/repair; agent-browser verified dashboard, upload→parse→editor, key creation, extension/deploy tabs, mobile viewport; no console errors

Stage Summary:
- App runs at `/` (single-page portal), APIs verified end-to-end with real data
- AI mapping quality confirmed: extracted firstName from fullName, generated grounded "why us" answer, repaired bad phone to profile value
- Production mode = MongoDB Atlas + Gemini API key via env vars; sandbox works with zero config
- Deliverables in repo root + download/: extension zips, README, .env.example, vercel.json

---
Task ID: 2
Agent: Super Z (main agent)
Task: Portability audit — ensure project works outside z.ai with real MongoDB on Vercel, and on all devices

Work Log:
- Re-initialized dev environment; confirmed dev server healthy (GET /api/health → {"db":"mongodb","ok":true})
- Audited production paths: mongo.ts uses MONGODB_URI (Atlas) when set, in-memory MongoDB only as zero-config preview fallback; ai.ts uses Gemini REST when GEMINI_API_KEY set (pure Gemini on Vercel), z-ai SDK only as caught fallback
- Removed all Prisma artifacts (prisma/schema.prisma, src/lib/db.ts, package.json scripts) to honor "MongoDB only" requirement
- Fixed /api/profile PUT to upsert — users can now create a profile manually without uploading a resume first (findOne + $setOnInsert pattern for driver v7)
- Fixed extension-view download button: now a real <a download> labeled "Download extension.zip" instead of a copy-link button reading "/extension.zip"
- Ran 12-check e2e curl suite (scripts/e2e-verify.sh): health, profile upsert/get, resume parse, key create, ext handshake, AI autofill mapping, error report, stats, AI repair — all pass (verified AI extracted contact fields and filled greenhouse form fields correctly)
- Agent-browser verified: desktop dashboard KPIs/activity, upload→parse→editor golden path live (JANE TESTER parsed), profile edit + save toast, Extension tab (keys + install steps + platform matrix), Deploy tab (Atlas/Gemini/Vercel guide), Applications tab empty state, sticky footer on short page
- Mobile 390x844 verified: stacked hero, scrollable tab nav, touch-friendly profile editor
- Zero browser console errors; lint clean; extension zip in public/ + download/ matches extension/ sources (33KB content.js)
- Copied deployment guide to download/APPLYPILOT-DEPLOY-GUIDE.md

Stage Summary:
- Confirmed standalone: no z.ai runtime dependencies when MONGODB_URI + GEMINI_API_KEY are set (Vercel production)
- Portal fully responsive (desktop + mobile); extension bundle portable to any Chrome/Edge/Brave
- App state: fully working, verified end-to-end after fixes
