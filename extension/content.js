/**
 * ApplyPilot — content script.
 * Runs on every http(s) page but only activates its UI when the page looks
 * like a job application form (known ATS or a form with enough fields).
 *
 * Pipeline:  scan fields → AI mapping (portal/Gemini) → fill → validate →
 *            AI repair of flagged fields → re-validate → report session.
 */
(() => {
  "use strict";

  if (window.__applypilotLoaded) return;
  window.__applypilotLoaded = true;

  // ── Platform registry ────────────────────────────────────────────────────
  const PLATFORMS = [
    { id: "workday", name: "Workday", test: /myworkdayjobs\.com|myworkday\.[a-z.]*com|wd\d+\./i, container: '[data-automation-id="pageContent"]' },
    { id: "greenhouse", name: "Greenhouse", test: /greenhouse\.io/i, container: "#application, form#s2ify_applications, .application" },
    { id: "lever", name: "Lever", test: /jobs\.lever\.co/i, container: "form#application-form, .application-page" },
    { id: "ashby", name: "Ashby", test: /ashbyhq\.com/i, container: '[data-test="application-form"], form' },
    { id: "smartrecruiters", name: "SmartRecruiters", test: /smartrecruiters\.com/i, container: ".application-form, form" },
    { id: "taleo", name: "Oracle Taleo", test: /taleo\.net/i, container: "form" },
    { id: "icims", name: "iCIMS", test: /icims\.com|jobs2web\.com/i, container: "form" },
    { id: "successfactors", name: "SAP SuccessFactors", test: /successfactors\.com/i, container: "form" },
    { id: "bamboohr", name: "BambooHR", test: /bamboohr\.com/i, container: "form" },
    { id: "jobvite", name: "Jobvite", test: /jobvite\.com/i, container: "form" },
    { id: "linkedin", name: "LinkedIn", test: /linkedin\.com\/jobs/i, container: "form.jobs-easy-apply-form, form" },
    { id: "indeed", name: "Indeed", test: /indeed\.com/i, container: ".job-application-form, form" },
    { id: "generic", name: "Generic ATS", test: /.*/, container: "form" },
  ];

  const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "image", "reset", "file", "password"]);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function detectPlatform() {
    const host = location.href;
    return PLATFORMS.find((p) => p.test.test(host)) || PLATFORMS[PLATFORMS.length - 1];
  }

  // ── Field scanning ───────────────────────────────────────────────────────

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
  }

  function labelForElement(el) {
    // 1) <label for=id>
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return lab.textContent.trim().replace(/\s+/g, " ");
    }
    // 2) wrapping label
    const wrap = el.closest("label");
    if (wrap) {
      const own = wrap.textContent.trim().replace(/\s+/g, " ");
      if (own && own.length < 400) return own;
    }
    // 3) aria
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || "");
      const joined = parts.filter(Boolean).join(" ").trim();
      if (joined) return joined;
    }
    // 4) Workday-style: preceding sibling / data-automation-id
    const auto = el.closest("[data-automation-id]")?.getAttribute("data-automation-id");
    // 5) placeholder / name / id
    return (
      (el.getAttribute("placeholder") || "").trim() ||
      (el.name || "").replace(/[_\-\[\]]+/g, " ").trim() ||
      (auto || "").replace(/[_\-]+/g, " ").trim() ||
      (el.id || "").replace(/[_\-]+/g, " ").trim()
    );
  }

  function classifyType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (["text", "email", "tel", "url", "number", "date", "month"].includes(t)) return t;
    return "text";
  }

  function collectFields(rootEl) {
    const root = rootEl || document;
    const controls = Array.from(
      root.querySelectorAll('input, select, textarea'),
    );
    const fields = [];
    let idx = 0;
    for (const el of controls) {
      const type = classifyType(el);
      if (SKIP_INPUT_TYPES.has((el.getAttribute("type") || "").toLowerCase())) continue;
      if (type === "radio") {
        // group radios by name → represented as one select-like field
        const name = el.name;
        if (name && fields.some((f) => f.groupName === name)) continue;
        const group = name ? Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : [el];
        const options = group
          .map((r) => (r.value || labelForElement(r)))
          .filter((v) => v && v.length < 120);
        fields.push({
          fieldId: `f${idx++}`,
          el: group[0],
          els: group,
          groupName: name || null,
          type: "radio",
          label: labelForElement(group[0]) || "choose an option",
          name: name || "",
          placeholder: "",
          required: group.some((r) => r.required),
          options,
          ariaLabel: group[0].getAttribute("aria-label") || "",
          maxLength: null,
        });
        continue;
      }
      if (!isVisible(el) && el.getAttribute("type") !== "hidden") {
        // still include rarely; skip truly invisible ones to keep noise low
        if (!el.checkVisibility?.({ checkOpacity: false, checkVisibilityCSS: false }) && !isVisible(el)) continue;
      }
      let options = null;
      if (type === "select") {
        options = Array.from(el.options)
          .map((o) => o.textContent.trim())
          .filter((v) => v && !/^(please|select|--)/i.test(v) && v.length < 120)
          .slice(0, 60);
      }
      fields.push({
        fieldId: `f${idx++}`,
        el,
        els: [el],
        groupName: null,
        type,
        label: labelForElement(el) || "(unlabeled field)",
        name: el.name || "",
        placeholder: el.getAttribute("placeholder") || "",
        required: el.required || el.getAttribute("aria-required") === "true",
        options,
        ariaLabel: el.getAttribute("aria-label") || "",
        maxLength: el.maxLength > 0 ? el.maxLength : null,
      });
    }
    return fields;
  }

  function looksLikeApplicationPage() {
    const platform = detectPlatform();
    if (platform.id !== "generic") return true;
    const fields = collectFields(document).filter((f) => f.type !== "checkbox" || f.label);
    const forms = document.querySelectorAll("form");
    let best = 0;
    forms.forEach((f) => {
      best = Math.max(best, f.querySelectorAll("input, select, textarea").length);
    });
    const keyword = /application|apply|resume|candidate|job/i.test(document.body?.innerText?.slice(0, 4000) || "");
    return (best >= 4 && keyword) || fields.length >= 6;
  }

  // ── Filling helpers (framework-safe) ─────────────────────────────────────

  function fireEvents(el, kinds) {
    for (const kind of kinds) {
      el.dispatchEvent(new Event(kind, { bubbles: true, cancelable: true }));
    }
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      el.focus({ preventScroll: true });
    } catch {}
    if (setter) setter.call(el, value);
    else el.value = value;
    fireEvents(el, ["input", "change"]);
    try {
      el.blur();
    } catch {}
  }

  function normalizeForInput(type, value) {
    let v = String(value ?? "").trim();
    if (type === "date") {
      const d = v.match(/^(\d{4})-(\d{2})-(\d{2})/) || v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (d) {
        if (d.length === 4) return `${d[3]}-${String(d[1]).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}`;
        return `${d[1]}-${d[2]}-${d[3]}`;
      }
      return v; // leave as-is; validator will flag
    }
    if (type === "month") {
      const m = v.match(/^(\d{4})-(\d{2})/) || v.match(/^([A-Za-z]{3,9})[\/ ,]+(\d{4})/);
      if (m) {
        if (/^[A-Za-z]/.test(m[1])) {
          const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const mi = months.findIndex((x) => m[1].toLowerCase().startsWith(x));
          if (mi >= 0) return `${m[2]}-${String(mi + 1).padStart(2, "0")}`;
        } else return v;
      }
      return v;
    }
    if (type === "number") return v.replace(/[^\d.-]/g, "");
    return v;
  }

  function fillTextField(field, value) {
    const el = field.el;
    const v = normalizeForInput(field.type, value);
    setNativeValue(el, v);
    return el.value === v;
  }

  function fillSelect(field, value) {
    const el = field.el;
    const want = String(value).trim().toLowerCase();
    let match = Array.from(el.options).find((o) => o.value.toLowerCase() === want);
    if (!match) {
      match = Array.from(el.options).find((o) => o.textContent.trim().toLowerCase() === want);
    }
    if (!match) {
      match = Array.from(el.options).find(
        (o) => o.textContent.trim().toLowerCase().startsWith(want) || o.textContent.trim().toLowerCase().includes(want),
      );
    }
    if (!match || match.disabled) return false;
    el.focus?.({ preventScroll: true });
    el.value = match.value;
    el.selectedValue = match.value;
    fireEvents(el, ["input", "change"]);
    try {
      el.blur();
    } catch {}
    return true;
  }

  function fillRadio(field, value) {
    const want = String(value).trim().toLowerCase();
    for (const r of field.els) {
      const text = (r.value || labelForElement(r) || "").trim().toLowerCase();
      const yes = /^(yes|y|true|check(ed)?|i agree|agree|accept|ok|on)$/i.test(want);
      const no = /^(no|n|false|uncheck(ed)?|decline|disagree|off)$/i.test(want);
      const hit =
        text === want ||
        (yes && /^(yes|y|true|agree|accept|ok|on)/i.test(text)) ||
        (no && /^(no|n|false|decline|disagree|off)/i.test(text));
      if (hit) {
        if (!r.checked) {
          r.checked = true;
          r.click?.(); // some frameworks bind via click
          fireEvents(r, ["input", "change"]);
        }
        return true;
      }
    }
    return false;
  }

  function fillCheckbox(field, value) {
    const el = field.el;
    const want = String(value).trim().toLowerCase();
    const shouldCheck = /^(check|checked|yes|true|on|agree|accept)$/i.test(want);
    const shouldUncheck = /^(uncheck|unchecked|no|false|off|decline|disagree)$/i.test(want);
    if (!shouldCheck && !shouldUncheck) return false;
    if (el.checked !== shouldCheck) {
      el.click?.();
      fireEvents(el, ["input", "change"]);
    }
    return el.checked === shouldCheck;
  }

  function applyFill(field, value) {
    try {
      switch (field.type) {
        case "select":
          return fillSelect(field, value);
        case "radio":
          return fillRadio(field, value);
        case "checkbox":
          return fillCheckbox(field, value);
        default:
          return fillTextField(field, value);
      }
    } catch {
      return false;
    }
  }

  // ── Validation / error auto-detection ────────────────────────────────────

  function validateFilled(field, value) {
    const errors = [];
    const el = field.el;
    const current = el.value || "";
    const label = field.label || field.name || field.fieldId;

    if (field.required && !current.trim()) {
      errors.push({ fieldLabel: label, message: "Required field was left empty", severity: "high" });
    }
    const semantic = /e-?mail/i.test(`${field.label} ${field.name} ${el.type}`) || el.type === "email";
    if (current && semantic && !EMAIL_RE.test(current)) {
      errors.push({ fieldLabel: label, message: `Value "${current}" is not a valid email address`, severity: "high" });
    }
    const phoneish = /phone|mobile|cell|telephone/i.test(`${field.label} ${field.name}`) || el.type === "tel";
    if (current && phoneish && current.replace(/\D/g, "").length < 7) {
      errors.push({ fieldLabel: label, message: "Phone number looks too short (needs at least 7 digits)", severity: "medium" });
    }
    const zipish = /zip|postal|postcode/i.test(`${field.label} ${field.name}`);
    if (current && zipish && !/^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/.test(current)) {
      errors.push({ fieldLabel: label, message: `"${current}" does not look like a valid ZIP / postal code`, severity: "medium" });
    }
    if (current && (el.type === "url" || /linked?in|website|portfolio|github/i.test(`${field.label} ${field.name}`))) {
      if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(current.trim())) {
        errors.push({ fieldLabel: label, message: `"${current}" is not a valid URL`, severity: "medium" });
      }
    }
    if (current && el.type === "number") {
      const n = Number(current);
      if (Number.isNaN(n)) errors.push({ fieldLabel: label, message: `"${current}" is not a number`, severity: "medium" });
      if (el.min !== "" && n < Number(el.min)) errors.push({ fieldLabel: label, message: `Value must be ≥ ${el.min}`, severity: "medium" });
      if (el.max !== "" && n > Number(el.max)) errors.push({ fieldLabel: label, message: `Value must be ≤ ${el.max}`, severity: "medium" });
    }
    if (current && el.maxLength > 0 && current.length > el.maxLength) {
      errors.push({ fieldLabel: label, message: `Value exceeds max length (${current.length} > ${el.maxLength})`, severity: "medium" });
    }
    if (el.matches('[aria-invalid="true"]')) {
      const banner = closestErrorText(el);
      errors.push({ fieldLabel: label, message: banner || "Field is marked invalid by the page", severity: "high", source: "page" });
    }
    return errors;
  }

  function closestErrorText(el) {
    const scope = el.closest("form, [role=group], fieldset, div") || el.parentElement;
    if (!scope) return "";
    for (let i = 0; i < 3 && scope; i++) {
      const err = scope.querySelector('[role="alert"], .error, [class*="error" i], [class*="invalid" i]');
      const t = err?.textContent?.trim();
      if (t) return t.slice(0, 160);
    }
    return "";
  }

  const ERROR_TEXT_RE =
    /(this field is required|required field|please (enter|select|fill)|enter a valid|is invalid|can'?t be blank|must be (a )?valid|doesn'?t (look|match)|please provide|cannot be (blank|empty)|value is not valid|fix the (following )?error)/i;

  function scanPageErrors(platform, filledEls) {
    const out = [];
    const selectors = [
      '[role="alert"]',
      '[aria-invalid="true"]',
      '[data-automation-id*="error" i]',
      "[class*='error' i]:not(script):not(style)",
      "[class*='invalid' i]:not(script):not(style)",
      "[class*='validation' i]:not(script):not(style)",
      ".field-error, .error-message, .text-danger, .invalid-feedback, .errorText",
    ];
    const seen = new Set();
    for (const sel of selectors) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (!isVisible(node) || seen.has(node)) continue;
        const text = (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200);
        if (!text || text.length > 200) continue;
        const meaningful =
          platform.id === "workday" ||
          platform.id === "greenhouse" ||
          ERROR_TEXT_RE.test(text) ||
          node.getAttribute("aria-invalid") === "true";
        if (!meaningful) continue;
        seen.add(node);
        // associate with nearest filled field
        let label = "";
        if (filledEls?.length) {
          let best = null;
          let bestDist = Infinity;
          for (const f of filledEls) {
            if (!f.el || !f.el.isConnected) continue;
            const dist = Math.abs(
              (node.compareDocumentPosition(f.el) & Node.DOCUMENT_POSITION_PRECEDING ? -1 : 1),
            );
            const pr = node.getBoundingClientRect();
            const fr = f.el.getBoundingClientRect();
            const gap = Math.abs(pr.top - fr.top) + Math.abs(pr.left - fr.left) / 4;
            const score = dist + gap / 1000;
            if (gap < 400 && score < bestDist) {
              bestDist = score;
              best = f;
            }
          }
          label = best?.label || "";
        }
        out.push({
          fieldLabel: label || "(page-level)",
          message: text,
          severity: "high",
          source: `${platform.name} validation banner`,
        });
        if (out.length >= 12) return out;
      }
    }
    return out;
  }

  function dedupeErrors(errors) {
    const seen = new Set();
    return errors.filter((e) => {
      const key = `${e.fieldLabel}::${e.message}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Floating widget (Shadow DOM) ─────────────────────────────────────────

  const HOST_ID = "__applypilot_host";
  let ui = null;

  function ensureWidget() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const wrap = document.createElement("div");
    wrap.className = "ap-root";
    wrap.innerHTML = `
      <div class="ap-panel ap-hidden" role="dialog" aria-label="ApplyPilot autofill report">
        <div class="ap-panel-head">
          <span class="ap-title">⚡ ApplyPilot</span>
          <button class="ap-close" aria-label="Close" title="Close">×</button>
        </div>
        <div class="ap-body">
          <div class="ap-steps"></div>
          <div class="ap-result"></div>
          <div class="ap-details"></div>
        </div>
      </div>
      <button class="ap-fab" aria-label="Run ApplyPilot AI autofill">
        <span class="ap-fab-icon">⚡</span>
        <span class="ap-fab-label">AI Autofill</span>
      </button>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .ap-root { all: initial; }
      * { box-sizing: border-box; }
      .ap-root { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .ap-fab { display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer; padding: 12px 18px; border-radius: 999px; background: linear-gradient(135deg, #10b981, #0d9488); color: #04110c; font-size: 14px; font-weight: 700; letter-spacing: .2px; box-shadow: 0 8px 24px rgba(16,185,129,.35); transition: transform .15s ease, box-shadow .15s ease; }
      .ap-fab:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(16,185,129,.5); }
      .ap-fab:active { transform: translateY(0); }
      .ap-fab.ap-busy { pointer-events: none; opacity: .75; }
      .ap-fab-icon { font-size: 15px; }
      .ap-fab.ap-busy .ap-fab-icon { display: inline-block; animation: ap-spin 1s linear infinite; }
      @keyframes ap-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .ap-panel { width: 360px; max-height: 70vh; display: flex; flex-direction: column; background: #0d1512; color: #e7f2ec; border: 1px solid rgba(16,185,129,.25); border-radius: 14px; overflow: hidden; box-shadow: 0 18px 48px rgba(0,0,0,.5); }
      .ap-hidden { display: none; }
      .ap-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(16,185,129,.08); border-bottom: 1px solid rgba(255,255,255,.06); }
      .ap-title { font-weight: 700; font-size: 13.5px; letter-spacing: .3px; }
      .ap-close { background: transparent; border: 0; color: #9fb8ac; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
      .ap-close:hover { background: rgba(255,255,255,.08); color: #fff; }
      .ap-body { padding: 12px 14px 14px; overflow-y: auto; }
      .ap-body::-webkit-scrollbar { width: 6px; }
      .ap-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 99px; }

      .ap-step { display: flex; align-items: center; gap: 9px; padding: 5px 0; font-size: 13px; color: #93a89d; }
      .ap-step-active { color: #34d399; }
      .ap-step-done { color: #d5e8dd; }
      .ap-step-done .ap-step-icon { color: #10b981; }
      .ap-step-warn { color: #fbbf24; }
      .ap-step-fail { color: #f87171; }
      .ap-step-icon { width: 14px; text-align: center; }
      .ap-step-active .ap-step-icon { animation: ap-pulse 1s ease infinite; }
      @keyframes ap-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

      .ap-result { margin-top: 10px; border-radius: 10px; padding: 10px 12px; font-size: 13px; display: none; }
      .ap-result.ap-ok { display: block; background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.35); }
      .ap-result.ap-warn { display: block; background: rgba(251,191,36,.10); border: 1px solid rgba(251,191,36,.35); }
      .ap-result-head { font-weight: 700; }
      .ap-result-sub { margin-top: 4px; font-size: 12px; opacity: .85; }

      .ap-details { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
      .ap-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 6px 9px; border-radius: 8px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.05); font-size: 12px; }
      .ap-item-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ap-item-value { grid-column: 1 / -1; color: #9fb8ac; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ap-item-status { font-size: 11px; white-space: nowrap; }
      .ap-item-status.ok { color: #34d399; }
      .ap-item-status.bad { color: #fbbf24; }
    `;
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.documentElement.appendChild(host);

    shadow.querySelector(".ap-close").addEventListener("click", () => {
      shadow.querySelector(".ap-panel").classList.add("ap-hidden");
    });
    shadow.querySelector(".ap-fab").addEventListener("click", () => runPipeline(shadow));

    ui = { host, shadow };
  }

  const STEP_ICONS = { pending: "○", active: "◉", done: "●", warn: "▲", fail: "×" };

  function renderSteps(shadow, steps) {
    const box = shadow.querySelector(".ap-steps");
    box.innerHTML = steps
      .map(
        ([label, state]) =>
          `<div class="ap-step ap-step-${state}"><span class="ap-step-icon">${STEP_ICONS[state]}</span><span>${label}</span></div>`,
      )
      .join("");
  }

  function showResult(shadow, ok, headline, detail, items) {
    const res = shadow.querySelector(".ap-result");
    res.className = `ap-result ${ok ? "ap-ok" : "ap-warn"}`;
    res.innerHTML = `<div class="ap-result-head">${ok ? "✔" : "⚠"} ${headline}</div>` +
      (detail ? `<div class="ap-result-sub">${detail}</div>` : "");
    const det = shadow.querySelector(".ap-details");
    det.innerHTML = (items || [])
      .map(
        (it) =>
          `<div class="ap-item"><span class="ap-item-label">${escapeHtml(it.label)}</span>` +
          `<span class="ap-item-value">${escapeHtml(it.value || "")}</span>` +
          `<span class="ap-item-status ${it.ok ? "ok" : "bad"}">${it.ok ? "✓" : "!"} ${escapeHtml(it.note || "")}</span></div>`,
      )
      .join("");
    shadow.querySelector(".ap-panel").classList.remove("ap-hidden");
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function sendToBackground(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else resolve(res || { ok: false, error: "No response" });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err) });
      }
    });
  }

  // ── Main pipeline ────────────────────────────────────────────────────────

  let running = false;

  async function runPipeline(shadow) {
    if (running) return;
    running = true;
    const started = Date.now();
    const platform = detectPlatform();

    const steps = [
      ["Scanning form fields", "active"],
      ["AI mapping fields → your profile", "pending"],
      ["Filling the application", "pending"],
      ["Validating & auto-detecting errors", "pending"],
      ["Reporting session to portal", "pending"],
    ];
    renderSteps(shadow, steps);
    shadow.querySelector(".ap-result").className = "ap-result";
    shadow.querySelector(".ap-result").innerHTML = "";
    shadow.querySelector(".ap-details").innerHTML = "";
    shadow.querySelector(".ap-panel").classList.remove("ap-hidden");
    shadow.querySelector(".ap-fab").classList.add("ap-busy");

    try {
      // 1) Scan
      const container = document.querySelector(platform.container) || document;
      let fields = collectFields(container);
      if (fields.length < 3) fields = collectFields(document);
      if (fields.length === 0) {
        renderSteps(shadow, steps.map(([l, s], i) => [l, i === 0 ? "fail" : s]));
        showResult(shadow, false, "No form fields found on this page", "Open a job application page and try again.", []);
        return;
      }
      const payloadFields = fields.map(({ fieldId, type, label, name, placeholder, required, options, ariaLabel, maxLength }) => ({
        fieldId, type, label, name, placeholder, required, options, ariaLabel, maxLength,
      }));
      steps[0][1] = "done";
      steps[1][1] = "active";
      renderSteps(shadow, steps);

      // 2) AI mapping (via background → portal)
      const jobDescription = extractJobDescription();
      const mapRes = await sendToBackground({
        type: "AUTOFILL",
        url: location.href,
        fields: payloadFields,
        jobDescription,
      });
      if (!mapRes.ok) throw new Error(mapRes.error || "AI mapping failed");
      steps[1][1] = "done";
      steps[2][1] = "active";
      renderSteps(shadow, steps);

      // 3) Fill
      const byId = new Map(fields.map((f) => [f.fieldId, f]));
      const fills = (mapRes.fills || [])
        .map((f) => ({ ...f, field: byId.get(f.fieldId) }))
        .filter((f) => f.field && f.value && String(f.value).trim() !== "" && f.confidence !== 0);
      const skipped = (mapRes.fills || [])
        .filter((f) => !f.value || f.confidence === 0)
        .map((f) => ({ label: byId.get(f.fieldId)?.label || f.fieldId, reason: f.reason || "no confident value" }));

      const results = [];
      for (const f of fills) {
        const ok = applyFill(f.field, f.value);
        results.push({
          field: f.field,
          value: String(f.value).slice(0, 80),
          ok,
          generated: f.source === "generated",
        });
      }
      steps[2][1] = "done";
      steps[3][1] = "active";
      renderSteps(shadow, steps);

      // 4) Validate: per-field checks + platform error banners
      await sleep(900); // let SPA validation settle
      let errors = [];
      for (const r of results) {
        errors.push(...validateFilled(r.field, r.value));
      }
      errors.push(...scanPageErrors(platform, results.map((r) => r.field)));
      errors = dedupeErrors(errors);

      // 4b) AI repair loop (max 2 rounds)
      const repairs = [];
      for (let round = 0; round < 2 && errors.length > 0; round++) {
        const repairable = errors.filter((e) => e.fieldLabel && e.fieldLabel !== "(page-level)");
        let repairedAny = false;
        for (const err of repairable.slice(0, 6)) {
          const r = results.find((x) => (x.field.label || "").includes(err.fieldLabel) || err.fieldLabel.includes(x.field.label || ""));
          const field = r?.field || fields.find((f) => (f.label || "").includes(err.fieldLabel));
          if (!field) continue;
          const rep = await sendToBackground({
            type: "REPAIR",
            url: location.href,
            field: { fieldId: field.fieldId, type: field.type, label: field.label, name: field.name, placeholder: field.placeholder, required: field.required, options: field.options, maxLength: field.maxLength },
            error: err.message,
            currentValue: field.el?.value || "",
          });
          if (rep?.ok && rep.value && String(rep.value).trim()) {
            applyFill(field, rep.value);
            repairs.push({ fieldLabel: field.label, oldValue: r?.value || "", newValue: String(rep.value).slice(0, 80) });
            repairedAny = true;
          }
        }
        await sleep(700);
        errors = dedupeErrors([
          ...errors.filter((e) => e.source !== `${platform.name} validation banner`),
          ...scanPageErrors(platform, results.map((r) => r.field)),
        ]);
        if (!repairedAny) break;
      }
      steps[3][1] = errors.length ? "warn" : "done";
      steps[4][1] = "active";
      renderSteps(shadow, steps);

      // 5) Report
      const report = {
        url: location.href,
        platform: platform.name,
        fieldCount: fields.length,
        filledCount: results.filter((r) => r.ok).length,
        skipped,
        errors,
        fixes: repairs,
        status: errors.length === 0 ? "completed" : results.length > 0 ? "partial" : "failed",
        durationMs: Date.now() - started,
      };
      const repRes = await sendToBackground({ type: "REPORT", report });
      steps[4][1] = repRes?.ok ? "done" : "warn";
      renderSteps(shadow, steps);

      showResult(
        shadow,
        errors.length === 0,
        `${results.filter((r) => r.ok).length}/${fields.length} fields filled${repairs.length ? ` · ${repairs.length} auto-repair${repairs.length === 1 ? "" : "s"}` : ""}`,
        errors.length
          ? `${errors.length} issue${errors.length === 1 ? "" : "s"} detected — review below before submitting.`
          : `All clear on ${platform.name}. ${repRes?.ok ? "Session saved to your portal." : ""}`,
        results.map((r) => ({
          label: r.field.label || r.field.fieldId,
          value: r.generated ? `AI: ${r.value}` : r.value,
          ok: r.ok,
          note: r.ok ? (r.generated ? "generated" : "") : "failed to set",
        })).concat(
          errors.map((e) => ({ label: e.fieldLabel || "page", value: "", ok: false, note: e.message.slice(0, 80) })),
        ),
      );
    } catch (err) {
      showResult(shadow, false, "Autofill stopped", err instanceof Error ? err.message : String(err), []);
    } finally {
      running = false;
      shadow.querySelector(".ap-fab").classList.remove("ap-busy");
    }
  }

  function extractJobDescription() {
    const sel =
      '.job-description, [class*="job-description" i], [data-automation-id="jobDescription"], [class*="jobDescription" i], [class*="description" i]';
    const node = document.querySelector(sel);
    const text = node?.innerText?.trim();
    return text && text.length > 200 ? text.slice(0, 8000) : "";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Boot: show the FAB only on plausible application pages ───────────────

  function boot() {
    if (!looksLikeApplicationPage()) {
      // retry a few times for SPAs that render late
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        if (document.getElementById(HOST_ID) || tries > 6) {
          clearInterval(t);
          return;
        }
        if (looksLikeApplicationPage()) {
          clearInterval(t);
          ensureWidget();
        }
      }, 1500);
      return;
    }
    ensureWidget();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    window.addEventListener("DOMContentLoaded", boot);
  }

  // Popup can trigger a fill manually even if the FAB was suppressed
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "PING_PAGE") {
      sendResponse({ ok: true, url: location.href });
      return;
    }
    if (msg?.type === "TRIGGER_FILL") {
      ensureWidget();
      if (ui?.shadow) {
        runPipeline(ui.shadow);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "No form detected on this page" });
      }
      return true;
    }
    return false;
  });
})();
