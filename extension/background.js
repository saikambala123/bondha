/**
 * ApplyPilot — background service worker (MV3).
 * All portal HTTP traffic goes through here so job-site page origins and
 * CORS never interfere. Settings live in chrome.storage.local.
 */

const DEFAULTS = {
  portalUrl: "",
  apiKey: "",
  connected: false,
  profileName: null,
  aiProvider: null,
  lastSession: null,
};

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...s };
}

function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function authHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function callPortal(path, settings, body) {
  const base = normalizeUrl(settings.portalUrl);
  if (!base || !settings.apiKey) {
    throw new Error("Extension is not connected — open the popup to set the portal URL and API key.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: authHeaders(settings.apiKey),
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || `Portal returned ${res.status}`;
      if (res.status === 401) {
        await chrome.storage.local.set({ connected: false });
      }
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_SETTINGS": {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          return;
        }

        case "SAVE_SETTINGS": {
          const clean = {
            portalUrl: normalizeUrl(msg.settings.portalUrl),
            apiKey: (msg.settings.apiKey || "").trim(),
          };
          await chrome.storage.local.set(clean);
          sendResponse({ ok: true });
          return;
        }

        case "CONNECT": {
          const settings = await getSettings();
          const data = await callPortal("/api/ext/handshake", settings, {});
          await chrome.storage.local.set({
            connected: true,
            profileName: data.profile?.fullName || null,
            aiProvider: data.aiProvider || null,
          });
          sendResponse({
            ok: true,
            connected: true,
            profile: data.profile || null,
            aiProvider: data.aiProvider,
            geminiConfigured: data.geminiConfigured,
          });
          return;
        }

        case "AUTOFILL": {
          const settings = await getSettings();
          const data = await callPortal("/api/ext/autofill", settings, {
            url: msg.url,
            fields: msg.fields,
            jobDescription: msg.jobDescription || undefined,
            generateAnswers: true,
          });
          sendResponse({ ok: true, ...data });
          return;
        }

        case "REPAIR": {
          const settings = await getSettings();
          const data = await callPortal("/api/ext/repair", settings, {
            field: msg.field,
            error: msg.error,
            currentValue: msg.currentValue,
            url: msg.url,
          });
          sendResponse({ ok: true, ...data });
          return;
        }

        case "REPORT": {
          const settings = await getSettings();
          const data = await callPortal("/api/ext/report", settings, msg.report);
          await chrome.storage.local.set({
            lastSession: { at: Date.now(), ...msg.report },
          });
          sendResponse({ ok: true, ...data });
          return;
        }

        default:
          sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    chrome.action.setBadgeText({ text: "GO" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 6000);
  }
});
