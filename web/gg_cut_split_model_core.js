/** Pure helpers for the Project Settings "AI Make Cut model" dropdown (GET/POST /gonggan/cut-split/model). No DOM. */

/**
 * Dropdown options: the listed text model files, with the current setting (else the default) preselected and
 * added on top when it is not in the list.
 * @param {{ models?: unknown[], current?: unknown, default?: unknown }|null|undefined} data
 * @returns {{ value: string, label: string, selected: boolean }[]}
 */
export function cutSplitModelOptions(data) {
  const models = [];
  for (const m of Array.isArray(data?.models) ? data.models : []) {
    const s = typeof m === "string" ? m.trim() : "";
    if (s && !models.includes(s)) models.push(s);
  }
  const pick = String(data?.current ?? "").trim() || String(data?.default ?? "").trim();
  const names = pick && !models.includes(pick) ? [pick, ...models] : models;
  return names.map((name) => ({
    value: name,
    label: models.includes(name) ? name : `${name} (not found)`,
    selected: name === pick,
  }));
}

/** @param {(s: string) => string} esc HTML escaper */
export function cutSplitModelOptionsHtml(options, esc) {
  return options
    .map((o) => `<option value="${esc(o.value)}"${o.selected ? " selected" : ""}>${esc(o.label)}</option>`)
    .join("");
}

/** The model to save, or null when nothing was loaded or the choice did not change. */
export function cutSplitModelChange(initial, chosen) {
  const a = String(initial ?? "").trim();
  const b = String(chosen ?? "").trim();
  return a && b && a !== b ? b : null;
}

/** Text shown in the dropdown when the list could not be loaded. @param {{ status?: number, message?: string }|null|undefined} err */
export function cutSplitModelLoadErrorText(err) {
  const st = err?.status;
  if (st === 404 || st === 405) return "Restart ComfyUI to load the model list";
  return `Could not load the model list${err?.message ? `: ${err.message}` : ""}`;
}

export const USE_AI_OFF_TIP = "Turn on Use AI in Project Settings";
export const AI_SPLIT_TIP = "Make cuts from a story with a local text model in ComfyUI";

/** Use AI setting from GET /gonggan/cut-split/model: on unless the server says false (older servers have no field). */
export function cutSplitUseAi(data) {
  return data?.use_ai !== false;
}

/** Shots toolbar AI Make Cut button (and its right-click entry). @param {boolean} useAi */
export function aiCutSplitButtonState(useAi) {
  return useAi ? { disabled: false, title: AI_SPLIT_TIP } : { disabled: true, title: USE_AI_OFF_TIP };
}

/**
 * Project Settings Save body for POST /gonggan/cut-split/model: only the fields that changed, or null.
 * `modelInitial` "" = the list never loaded (model not saved); `useAiInitial` null = unknown (Use AI not saved).
 * @param {{ modelInitial?: string, model?: string, useAiInitial?: boolean|null, useAi?: boolean }} s
 */
export function cutSplitSettingsPatch(s = {}) {
  const body = {};
  const model = cutSplitModelChange(s.modelInitial, s.model);
  if (model) body.clip_name = model;
  if (typeof s.useAiInitial === "boolean" && typeof s.useAi === "boolean" && s.useAi !== s.useAiInitial) {
    body.use_ai = s.useAi;
  }
  return Object.keys(body).length ? body : null;
}

/**
 * Missing-model notice (GET /gonggan/cut-split/precheck `missing`, or a "missing_model" error body): model name,
 * target folder, and download / page links for the default model only.
 * @returns {{ name: string, folder: string, url: string, page: string }|null}
 */
export function cutSplitMissingModel(missing) {
  const name = typeof missing?.name === "string" ? missing.name.trim() : "";
  if (!name) return null;
  const link = (u) => (typeof u === "string" && /^https:\/\//.test(u.trim()) ? u.trim() : "");
  return {
    name,
    folder: (typeof missing.folder === "string" && missing.folder.trim()) || "models/text_encoders",
    url: link(missing.url),
    page: link(missing.page),
  };
}

/** @param {{ name: string, folder: string, url: string, page: string }} info @param {(s: string) => string} esc */
export function cutSplitMissingModelHtml(info, esc) {
  const links = [
    info.url ? `<a class="gg-mm-link gg-mm-download" href="${esc(info.url)}" target="_blank" rel="noopener noreferrer">Download</a>` : "",
    info.page ? `<a class="gg-mm-link" href="${esc(info.page)}" target="_blank" rel="noopener noreferrer">Model page</a>` : "",
  ].filter(Boolean).join("");
  return `<div class="gg-mm-title">Missing model</div>
    <div class="gg-mm-text">AI Make Cut needs this text model, but ComfyUI cannot find it:</div>
    <div class="gg-mm-row"><code class="gg-mm-name">${esc(info.name)}</code>${links ? `<span class="gg-mm-links">${links}</span>` : ""}</div>
    <div class="gg-mm-text">Put the file in <code class="gg-mm-folder">${esc(info.folder)}</code> (inside your ComfyUI folder), then click Split again.</div>`;
}

/** Bytes -> "4.6 GB" (one decimal). */
export function formatGb(bytes) {
  const n = Number(bytes);
  return Number.isFinite(n) && n > 0 ? `${(n / 1024 ** 3).toFixed(1)} GB` : "";
}

/**
 * Confirm text for a precheck memory warning ("no_gpu" / "low_vram"), or null when there is none.
 * OK button = "Continue anyway".
 * @param {{ reason?: string, free?: number|null, need?: number|null }|null|undefined} memory
 * @param {string} [model]
 * @returns {{ message: string, okLabel: string }|null}
 */
export function cutSplitMemoryConfirm(memory, model) {
  const reason = memory?.reason;
  if (reason !== "no_gpu" && reason !== "low_vram") return null;
  const what = model ? `The text model ${model}` : "The text model";
  const need = formatGb(memory.need);
  const tail = "ComfyUI may run it on the CPU, which is very slow and may crash.";
  const body = reason === "no_gpu"
    ? `ComfyUI found no GPU. ${what}${need ? ` needs about ${need}` : ""} and would run on the CPU, which is very slow and may crash.`
    : `Free VRAM is about ${formatGb(memory.free) || "0 GB"}, but ${what} needs about ${need} (file size + margin). ${tail}`;
  return {
    message: `${reason === "no_gpu" ? "No GPU found" : "Not enough free VRAM"}\n${body}`,
    okLabel: "Continue anyway",
  };
}

/**
 * What the Split button does after GET /gonggan/cut-split/precheck: "off" (Use AI off), "missing" (show the
 * notice, do not run), "confirm" (memory warning first), "run".
 */
export function cutSplitPrecheckStep(pre) {
  if (pre?.use_ai === false) return "off";
  if (cutSplitMissingModel(pre?.missing)) return "missing";
  if (cutSplitMemoryConfirm(pre?.memory, pre?.model)) return "confirm";
  return "run";
}
