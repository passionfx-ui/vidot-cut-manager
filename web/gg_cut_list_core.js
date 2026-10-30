/** AI Cut Split: cut list parser / checks and the create-cuts request (pure, no DOM). */

import { DEFAULT_VIDEO_TEMPLATE, templateLabel } from "./gg_template_pick_core.js";

export const CUT_DURATION_MIN = 0.5;
export const CUT_DURATION_MAX = 3;
export const CUT_LIST_MAX = 200;

export const DESCRIPTION_MAX_LEN = 300;
const NAME_MAX_LEN = 80;
/** "content" / "ltx_prompt" (0.9.115 lists) are read as "description". */
const DESCRIPTION_ALIASES = ["description", "content", "ltx_prompt"];

/** Text of the first top-level JSON array in `text` (code fences and surrounding prose ignored), else null. */
export function extractJsonArray(text) {
  const s = String(text ?? "").replace(/```[a-zA-Z]*\s*/g, "");
  for (let start = s.indexOf("["); start >= 0; start = s.indexOf("[", start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = s.slice(start, i + 1);
          if (ch === "]" && /^\[\s*(\{|\])/.test(candidate)) return candidate;
          break;
        }
      }
    }
  }
  return null;
}

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

function show(v) {
  if (isNumber(v)) return String(v);
  const s = JSON.stringify(v) ?? String(v);
  return s.length <= 40 ? s : `${s.slice(0, 37)}...`;
}

/**
 * The cut array of an LLM answer: a bare array, an object wrapping one ({"cuts": [...]}), or the first array
 * inside prose / code fences. Returns { items } or { error }.
 */
export function extractCutItems(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch {
    const raw = extractJsonArray(text);
    if (raw === null) return { error: 'No JSON array found. Expected [{"cut", "duration", "description"}, ...].' };
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { error: `Not valid JSON: ${e.message}` };
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const lists = Object.values(data).filter(Array.isArray);
    if (Array.isArray(data.cuts)) data = data.cuts;
    else if (lists.length === 1) data = lists[0];
    else if ("description" in data || "content" in data) data = [data];
  }
  if (!Array.isArray(data)) return { error: 'Expected a JSON array of cuts: [{"cut", "duration", "description"}, ...].' };
  return { items: data };
}

/**
 * Strict check of [{cut, duration, description}] (same rules and messages as gg_ltx.validate_cut_list).
 * @returns {{ ok: boolean, cuts: {cut:number, duration:number, description:string}[], errors: string[] }} cuts in `cut` order, renumbered 1..N
 */
export function validateCutItems(items) {
  const fail = (msg) => ({ ok: false, cuts: [], errors: [msg] });
  if (!Array.isArray(items)) return fail('The cut list must be a JSON array: [{"cut", "duration", "description"}, ...].');
  if (!items.length) return fail("The cut list is empty.");
  if (items.length > CUT_LIST_MAX) return fail(`At most ${CUT_LIST_MAX} cuts per list (got ${items.length}).`);
  const errors = [];
  const rows = [];
  const seen = new Map();
  items.forEach((e, i) => {
    let where = `Item ${i + 1}`;
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      errors.push(`${where}: must be an object like {"cut": 1, "duration": 2, "description": "..."}.`);
      return;
    }
    const bad = errors.length;
    const num = e.cut;
    if (num == null) errors.push(`${where}: "cut" is missing.`);
    else if (!isNumber(num) || num < 1 || !Number.isInteger(num)) errors.push(`${where}: "cut" must be a whole number from 1 (got ${show(num)}).`);
    else {
      where = `${where} (cut ${num})`;
      if (seen.has(num)) errors.push(`${where}: "cut" ${num} is used twice (also item ${seen.get(num) + 1}).`);
      else seen.set(num, i);
    }
    const sec = e.duration;
    if (sec == null) errors.push(`${where}: "duration" is missing.`);
    else if (!isNumber(sec)) errors.push(`${where}: "duration" must be a number of seconds (got ${show(sec)}).`);
    else if (sec < CUT_DURATION_MIN || sec > CUT_DURATION_MAX) {
      errors.push(`${where}: "duration" must be between ${CUT_DURATION_MIN} and ${CUT_DURATION_MAX} seconds (got ${show(sec)}).`);
    }
    const key = DESCRIPTION_ALIASES.find((k) => e[k] != null) || "description";
    let desc = e[key];
    if (typeof desc === "string") desc = desc.split(/\s+/).filter(Boolean).join(" ");
    if (desc == null || desc === "") errors.push(`${where}: "description" is missing.`);
    else if (typeof desc !== "string") errors.push(`${where}: "${key}" must be text (got ${show(desc)}).`);
    else if (desc.length > DESCRIPTION_MAX_LEN) errors.push(`${where}: "${key}" is too long (${desc.length} characters, max ${DESCRIPTION_MAX_LEN}).`);
    if (errors.length === bad) rows.push({ order: num, duration: Math.round(sec * 100) / 100, description: desc });
  });
  if (errors.length) return { ok: false, cuts: [], errors };
  rows.sort((a, b) => a.order - b.order);
  return { ok: true, cuts: rows.map((r, i) => ({ cut: i + 1, duration: r.duration, description: r.description })), errors: [] };
}

/** Parse the AI Cut Split answer into cuts; see validateCutItems. */
export function parseCutList(text) {
  if (!String(text ?? "").trim()) return { ok: false, cuts: [], errors: ["The answer is empty."] };
  const x = extractCutItems(text);
  if (x.error) return { ok: false, cuts: [], errors: [x.error] };
  return validateCutItems(x.items);
}

/** Cut name shown in Shots for a description (the full text is the caption and the LTX prompt). */
export function cutNameOf(description) {
  return String(description || "").slice(0, NAME_MAX_LEN).trim();
}

/** One-line preview under the textarea, e.g. "6 cuts · 15.5 s total". */
export function cutListSummary(parsed) {
  if (!parsed?.ok) return "";
  const n = parsed.cuts.length;
  const total = Math.round(parsed.cuts.reduce((s, c) => s + c.duration, 0) * 100) / 100;
  return `${n} cut${n === 1 ? "" : "s"} · ${total} s total`;
}

/** Confirm text: title line, then the first cuts. */
export function createCutsConfirmMessage(cuts, workflowLabel) {
  const n = cuts.length;
  const lines = cuts.slice(0, 8).map((c) => `${c.cut}. ${c.description.slice(0, 60)} (${c.duration}s)`);
  if (n > 8) lines.push(`… and ${n - 8} more`);
  return `Create ${n} cut${n === 1 ? "" : "s"}?\n\nWorkflow: ${workflowLabel}\n${lines.join("\n")}\n\nNothing is queued. Select the cuts and press Queue to render.`;
}

/**
 * Workflow of the new cuts: the project's Video template (id "" = let the server use it).
 * @param {{ video_template?: string } | null | undefined} settings project settings
 */
export function cutListWorkflow(settings) {
  const ref = String(settings?.video_template || "").trim() || DEFAULT_VIDEO_TEMPLATE;
  return { id: "", label: `Project Video template (${templateLabel(ref)})` };
}

/** Request body for POST /gonggan/cut/add-list; no workflow = the project's Video template. */
export function cutListPayload(pid, cuts, workflow, after) {
  const body = {
    pid,
    cuts: cuts.map((c) => ({ cut: c.cut, duration: c.duration, description: c.description })),
  };
  if (workflow) body.workflow = workflow;
  if (after) body.after = after;
  return body;
}

/** Status line after a split, e.g. "6 cuts · 15.5 s total · qwen3vl_4b_int8_convrot.safetensors · 1 retry". */
export function aiCutSplitStatusText(parsed, { model = "", attempts = 1 } = {}) {
  const retries = Math.max(0, (Number(attempts) || 1) - 1);
  return [cutListSummary(parsed), model, retries ? `${retries} ${retries === 1 ? "retry" : "retries"}` : ""]
    .filter(Boolean).join(" · ");
}
