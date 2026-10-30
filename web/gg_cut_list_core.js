/** AI Make Cut (internally "cut split"): cut list parser / checks, the create-cuts request and the run / poll loop (pure, no DOM). */

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

/** Visible name of the feature (internal routes / files / settings keep "cut split"). */
export const AI_MAKE_CUT_LABEL = "AI Make Cut";
/** How long the dialog waits for one run (a run takes about 1–4 minutes). */
export const AI_MAKE_CUT_WAIT_MS = 10 * 60 * 1000;
export const AI_MAKE_CUT_POLL_MS = 1500;
/** Status polls may fail this long in a row (busy ComfyUI) before the dialog gives up. */
export const AI_MAKE_CUT_POLL_ERROR_MS = 60 * 1000;
export const STORY_TOO_LONG_MESSAGE = "Story too long for one split, try a shorter part.";
export const AI_MAKE_CUT_TIMEOUT_TEXT =
  "No result after 10 minutes. It may still be running in ComfyUI: close this and open AI Make Cut again later to get the result.";
export const AI_MAKE_CUT_LOST_TEXT = "Lost contact with ComfyUI while waiting for AI Make Cut. Check that ComfyUI is running, then open AI Make Cut again.";

/** 75 -> "1:15". */
export function formatElapsed(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Status line while a background run is going (job from POST / GET /gonggan/ai-cut-split[/status]). */
export function aiMakeCutProgressText(job) {
  const attempt = Number(job?.attempt) || 1;
  const max = Number(job?.max_attempts) || 2;
  const retry = attempt > 1 ? ` · retry ${attempt - 1} of ${Math.max(1, max - 1)} (the first answer was not a valid cut list)` : "";
  return `Making cuts… ${formatElapsed(job?.seconds)}${retry}. This usually takes 1–4 minutes (loading the text model is the slow part).`;
}

/** Text for a failed run or request. @param {{ code?: string, status?: number, name?: string, message?: string }|null|undefined} err */
export function aiMakeCutErrorText(err) {
  if (err?.code === "too_long") return STORY_TOO_LONG_MESSAGE;
  if (err?.name === "AbortError") return AI_MAKE_CUT_TIMEOUT_TEXT;
  if (err?.status === 404 && !err?.code) return "Restart ComfyUI to use AI Make Cut (new server route).";
  return err?.message || "AI Make Cut failed.";
}

/** A finished run that the dialog should offer again: done, has cuts, and its cuts were not created yet. */
export function aiMakeCutResumable(job, usedId) {
  return !!job && job.state === "done" && Array.isArray(job.cuts) && job.cuts.length > 0 && !!job.id && job.id !== usedId;
}

/**
 * Starts (or resumes) one background AI Make Cut run and waits for it by polling its status, so no single request
 * has to stay open for the whole run. Resolves { kind: "done", job } (job.cuts = the answer), { kind: "timeout", job }
 * after `waitMs`, or { kind: "closed", job } once `isActive()` is false; the server keeps the result either way.
 * Throws the start request's error, or an Error with `code` / `data` when the run failed.
 * An older server answers the start request with the cuts directly; that counts as done.
 * @param {{ start?: () => Promise<any>, poll: (id: string) => Promise<any>, job?: any, onProgress?: (job: any) => void,
 *   sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number, pollErrorMs?: number,
 *   isActive?: () => boolean }} o
 */
export async function runAiMakeCutJob(o) {
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now || (() => Date.now());
  const isActive = o.isActive || (() => true);
  const onProgress = o.onProgress || (() => {});
  const waitMs = o.waitMs ?? AI_MAKE_CUT_WAIT_MS;
  const pollMs = o.pollMs ?? AI_MAKE_CUT_POLL_MS;
  const pollErrorMs = o.pollErrorMs ?? AI_MAKE_CUT_POLL_ERROR_MS;
  let job = o.job || null;
  if (!job) {
    const d = await o.start();
    if (Array.isArray(d?.cuts)) return { kind: "done", job: { id: "", state: "done", cuts: d.cuts, model: d.model, attempts: d.attempts } };
    job = d?.job;
    if (!job?.id) throw new Error("ComfyUI did not start AI Make Cut. Restart ComfyUI, then try again.");
  }
  const t0 = now();
  let lastOk = t0;
  for (;;) {
    if (job.state === "done") return { kind: "done", job };
    if (job.state === "error") {
      const err = new Error(job.message || "AI Make Cut failed.");
      err.code = job.code;
      err.data = job;
      throw err;
    }
    onProgress(job);
    if (!isActive()) return { kind: "closed", job };
    if (now() - t0 >= waitMs) return { kind: "timeout", job };
    await sleep(pollMs);
    if (!isActive()) return { kind: "closed", job };
    try {
      const d = await o.poll(job.id);
      if (d?.job) job = d.job;
      lastOk = now();
    } catch (e) {
      if (e?.status === 404) throw e;
      if (now() - lastOk >= pollErrorMs) {
        const err = new Error(AI_MAKE_CUT_LOST_TEXT);
        err.code = "lost";
        throw err;
      }
    }
  }
}
