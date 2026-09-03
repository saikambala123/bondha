/** ApplyPilot — popup logic. */
const $ = (id) => document.getElementById(id);

const els = {
  statusLine: $("statusLine"),
  portalUrl: $("portalUrl"),
  apiKey: $("apiKey"),
  saveBtn: $("saveBtn"),
  connectBtn: $("connectBtn"),
  connectError: $("connectError"),
  connectCard: $("connectCard"),
  readyCard: $("readyCard"),
  profileName: $("profileName"),
  aiProvider: $("aiProvider"),
  fillBtn: $("fillBtn"),
  lastSession: $("lastSession"),
  dashboardLink: $("dashboardLink"),
};

function send(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: "No response" });
    });
  });
}

function setStatus(text, cls) {
  els.statusLine.textContent = text;
  els.statusLine.className = `status ${cls || ""}`;
}

function showConnected(state) {
  els.connectCard.classList.add("hidden");
  els.readyCard.classList.remove("hidden");
  els.profileName.textContent = state.profileName || "No profile yet — upload a resume";
  els.aiProvider.textContent =
    state.aiProvider === "gemini" ? "Google Gemini" : state.aiProvider ? "Fallback engine" : "—";
  if (state.portalUrl) {
    els.dashboardLink.href = `${state.portalUrl.replace(/\/+$/, "")}/`;
  }
  renderLastSession(state.lastSession);
}

function showConnectForm(settings) {
  els.readyCard.classList.add("hidden");
  els.connectCard.classList.remove("hidden");
  if (settings) {
    els.portalUrl.value = settings.portalUrl || "";
    els.apiKey.value = settings.apiKey || "";
  }
}

function renderLastSession(s) {
  if (!s || !s.platform) {
    els.lastSession.classList.add("hidden");
    return;
  }
  const when = new Date(s.at).toLocaleString();
  const errCount = s.errors?.length || 0;
  els.lastSession.classList.remove("hidden");
  els.lastSession.innerHTML =
    `<p><b>Last session</b> — ${escapeHtml(s.platform)} · ${escapeHtml(when)}</p>` +
    `<p class="${errCount ? "warn" : "ok"}">${s.filledCount}/${s.fieldCount} fields filled` +
    `${errCount ? ` · ${errCount} issue${errCount === 1 ? "" : "s"} detected` : " · no errors"}</p>` +
    (errCount
      ? `<p class="bad">${escapeHtml(s.errors.slice(0, 3).map((e) => e.message).join(" · "))}</p>`
      : "");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function init() {
  const res = await send({ type: "GET_SETTINGS" });
  if (!res.ok) {
    setStatus("Extension error", "bad");
    return;
  }
  const settings = res.settings;
  if (settings.connected) {
    setStatus("Connected", "ok");
    showConnected(settings);
  } else if (settings.portalUrl || settings.apiKey) {
    setStatus("Not connected — press Connect", "");
    showConnectForm(settings);
  } else {
    setStatus("Set your portal URL & API key", "");
    showConnectForm(settings);
  }
}

els.saveBtn.addEventListener("click", async () => {
  els.saveBtn.disabled = true;
  const res = await send({
    type: "SAVE_SETTINGS",
    settings: { portalUrl: els.portalUrl.value, apiKey: els.apiKey.value },
  });
  els.saveBtn.disabled = false;
  if (res.ok) setStatus("Saved — now press Connect", "");
  else setStatus("Could not save", "bad");
});

els.connectBtn.addEventListener("click", async () => {
  els.connectBtn.disabled = true;
  els.connectError.classList.add("hidden");
  setStatus("Connecting…", "");
  await send({
    type: "SAVE_SETTINGS",
    settings: { portalUrl: els.portalUrl.value, apiKey: els.apiKey.value },
  });
  const res = await send({ type: "CONNECT" });
  els.connectBtn.disabled = false;
  if (res.ok) {
    setStatus("Connected", "ok");
    const settings = await send({ type: "GET_SETTINGS" });
    showConnected({
      profileName: res.profile?.fullName || null,
      aiProvider: res.aiProvider,
      portalUrl: els.portalUrl.value,
      lastSession: settings.ok ? settings.settings.lastSession : null,
    });
  } else {
    setStatus("Connection failed", "bad");
    els.connectError.textContent = res.error || "Could not reach portal";
    els.connectError.classList.remove("hidden");
  }
});

els.fillBtn.addEventListener("click", async () => {
  els.fillBtn.disabled = true;
  els.fillBtn.textContent = "Working…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    els.fillBtn.disabled = false;
    els.fillBtn.textContent = "⚡ Autofill this page";
    return;
  }
  // ensure the content script is present (e.g. page loaded before install)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch {
    /* restricted page — will error below */
  }
  const res = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL" }, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(r || { ok: false, error: "No response" });
    });
  });
  els.fillBtn.disabled = false;
  els.fillBtn.textContent = "⚡ Autofill this page";
  if (!res.ok) {
    setStatus(res.error || "Could not autofill this page", "bad");
    window.setTimeout(() => setStatus("Connected", "ok"), 2500);
  } else {
    window.close(); // let the on-page panel take over
  }
});

init();
