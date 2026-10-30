/** Script to cuts with LTX: the LLM prompt, the Paste Cut List / AI Cut Split parser and Ollama helpers (pure, no DOM). */

export const CUT_DURATION_MIN = 0.5;
export const CUT_DURATION_MAX = 3;
export const CUT_LIST_MAX = 200;

export const LTX_WORKFLOWS = [
  { id: "t2v", label: "Text to video (LTX-Video)" },
  { id: "i2v", label: "Image to video (LTX-Video, pick a start image per cut)" },
];

export const DESCRIPTION_MAX_LEN = 300;
const NAME_MAX_LEN = 80;
/** "content" / "ltx_prompt" (0.9.115 lists) are read as "description". */
const DESCRIPTION_ALIASES = ["description", "content", "ltx_prompt"];

// Same text as CUT_SPLIT_PROMPT in gg_ltx.py (the server sends it to Ollama; a test keeps them equal).
export const CUT_SPLIT_PROMPT = `You are a film director and storyboard artist. Split the story below into cuts for short AI-generated video clips.

Return ONLY a JSON array, with no other text and no markdown code fences:
[
  {"cut": 1, "duration": 3, "description": "one short line describing the shot"}
]

Fields:
- "cut": whole number, 1, 2, 3 ... in story order.
- "duration": seconds, a number from 0.5 to 3 (never more than 3).
- "description": one short line in English, under 200 characters: who or what, the action, the place, the shot size and the camera move. It is used directly as the video prompt and as the cut name.

Guidance:
- One action per cut, at most 3 seconds. Split longer actions into several cuts.
- Every description must stand alone: name the characters and the place again each time (no "he", no "same room").
- No dialogue, no on-screen text, no cut numbers inside description.
- Valid JSON only: double quotes, no trailing commas, no comments.

STORY:
`;

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

/** Parse pasted LLM output (or the AI Cut Split answer) into cuts; see validateCutItems. */
export function parseCutList(text) {
  if (!String(text ?? "").trim()) return { ok: false, cuts: [], errors: ["Paste the JSON cut list first."] };
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
  return `Create ${n} cut${n === 1 ? "" : "s"}?\n\nWorkflow: ${workflowLabel}\n${lines.join("\n")}\n\nNothing is queued. Press Queue with no cut selected (or Queue on a cut) to render.`;
}

/** Request body for POST /gonggan/cut/add-list. */
export function cutListPayload(pid, cuts, workflow, after) {
  const body = {
    pid,
    workflow: workflow || "t2v",
    cuts: cuts.map((c) => ({ cut: c.cut, duration: c.duration, description: c.description })),
  };
  if (after) body.after = after;
  return body;
}

// ---- AI Cut Split (local Ollama through the plugin's server routes) ----
export const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";

/** Base URL from the plugin setting (blank = server default). */
export function ollamaBaseUrl(setting) {
  return String(setting ?? "").trim().replace(/\/+$/, "");
}

/** Query string for GET /gonggan/ollama/models. */
export function ollamaModelsQuery(baseUrl) {
  const u = ollamaBaseUrl(baseUrl);
  return u ? `?base_url=${encodeURIComponent(u)}` : "";
}

/** Model to preselect: the last used one when still installed, else a qwen2.5 model, else the first. */
export function pickDefaultModel(models, last) {
  const list = Array.isArray(models) ? models : [];
  if (last && list.includes(last)) return last;
  return list.find((m) => /^qwen2\.5/i.test(m)) || list[0] || "";
}

/** Request body for POST /gonggan/ai-cut-split (keep_alive 0 on the server unless keepLoaded). */
export function aiCutSplitPayload({ story, model, keepLoaded = false, baseUrl = "" }) {
  const body = { story: String(story ?? ""), model: String(model ?? ""), keep_loaded: !!keepLoaded };
  const u = ollamaBaseUrl(baseUrl);
  if (u) body.base_url = u;
  return body;
}

/** Text under the model list when Ollama could not be reached / has no models. */
export function ollamaUnavailableText({ code, message, url } = {}) {
  const where = ollamaBaseUrl(url) || OLLAMA_DEFAULT_URL;
  if (code === "no_models") return `No models installed in Ollama at ${where}. Run: ollama pull qwen2.5:7b — or use Paste Cut List instead.`;
  const head = code === "unreachable" || !message ? `Ollama not running at ${where}.` : String(message);
  return `${head} Start Ollama, or use Copy Cut Split Prompt with any LLM and Paste Cut List instead.`;
}
