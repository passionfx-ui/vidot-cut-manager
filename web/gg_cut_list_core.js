/** Script to cuts with LTX: the LLM prompt and the Paste Cut List parser (pure, no DOM). */

export const CUT_DURATION_MIN = 0.5;
export const CUT_DURATION_MAX = 3;
export const CUT_LIST_MAX = 200;

export const LTX_WORKFLOWS = [
  { id: "t2v", label: "Text to video (LTX-Video)" },
  { id: "i2v", label: "Image to video (LTX-Video, pick a start image per cut)" },
];

export const CUT_SPLIT_PROMPT = `You are a film director and storyboard artist. Split the story below into cuts for short AI-generated video clips.

Return ONLY a JSON array, with no other text and no markdown code fences:
[
  {"cut": 1, "duration": 3, "content": "short description of the cut", "ltx_prompt": "detailed video prompt for LTX-Video"}
]

Fields:
- "cut": number, 1, 2, 3 ... in story order.
- "duration": seconds, a number from 0.5 to 3 (never more than 3).
- "content": one short line (under 80 characters) saying what happens in the cut.
- "ltx_prompt": a detailed video prompt for LTX-Video, in English, one paragraph of 60-150 words.

Guidance:
- Think cinematically: choose a shot size (wide, medium, close-up) and a camera move for every cut.
- One action per cut, at most 3 seconds. Split longer actions into several cuts.
- Write each ltx_prompt like a description of real footage, in this order: the main action in one sentence, specific movements and gestures, the look of characters and objects, background and environment, camera angle and movement, lighting and colors.
- Every ltx_prompt must stand alone: describe recurring characters, clothes, places and lighting again each time so they stay consistent between cuts.
- No dialogue, no on-screen text, no cut numbers inside ltx_prompt.
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

function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string" && v.trim()) return Number.parseFloat(v);
  return NaN;
}

export function clampCutDuration(sec) {
  return Math.round(Math.min(CUT_DURATION_MAX, Math.max(CUT_DURATION_MIN, sec)) * 100) / 100;
}

/**
 * Parse pasted LLM output into cuts in `cut` order.
 * @returns {{ ok: boolean, cuts: {cut:number, duration:number, content:string, ltx_prompt:string, clamped:boolean}[], errors: string[] }}
 */
export function parseCutList(text) {
  const fail = (msg) => ({ ok: false, cuts: [], errors: [msg] });
  if (!String(text ?? "").trim()) return fail("Paste the JSON cut list first.");
  const raw = extractJsonArray(text);
  if (raw === null) return fail("No JSON array found. Expected [{cut, duration, content, ltx_prompt}, ...].");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return fail(`Not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(data) || !data.length) return fail("The cut list is empty.");
  if (data.length > CUT_LIST_MAX) return fail(`At most ${CUT_LIST_MAX} cuts per list (got ${data.length}).`);
  const errors = [];
  const rows = [];
  data.forEach((item, i) => {
    const where = `Cut ${i + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${where}: not an object.`);
      return;
    }
    const content = typeof item.content === "string" ? item.content.trim() : "";
    const prompt = typeof item.ltx_prompt === "string" ? item.ltx_prompt.trim() : "";
    const sec = toNumber(item.duration);
    const num = toNumber(item.cut);
    if (!content) errors.push(`${where}: "content" is missing.`);
    if (!prompt) errors.push(`${where}: "ltx_prompt" is missing.`);
    if (!Number.isFinite(sec)) errors.push(`${where}: "duration" must be a number of seconds.`);
    if (!content || !prompt || !Number.isFinite(sec)) return;
    const duration = clampCutDuration(sec);
    rows.push({ order: Number.isFinite(num) ? num : i + 1, index: i, content, ltx_prompt: prompt, duration, clamped: duration !== sec });
  });
  if (errors.length) return { ok: false, cuts: [], errors };
  rows.sort((a, b) => a.order - b.order || a.index - b.index);
  const cuts = rows.map((r, i) => ({ cut: i + 1, duration: r.duration, content: r.content, ltx_prompt: r.ltx_prompt, clamped: r.clamped }));
  return { ok: true, cuts, errors: [] };
}

/** One-line preview under the textarea, e.g. "6 cuts · 15.5 s total (2 durations clamped to 0.5–3 s)". */
export function cutListSummary(parsed) {
  if (!parsed?.ok) return "";
  const n = parsed.cuts.length;
  const total = Math.round(parsed.cuts.reduce((s, c) => s + c.duration, 0) * 100) / 100;
  const clamped = parsed.cuts.filter((c) => c.clamped).length;
  const tail = clamped ? ` (${clamped} duration${clamped === 1 ? "" : "s"} clamped to ${CUT_DURATION_MIN}–${CUT_DURATION_MAX} s)` : "";
  return `${n} cut${n === 1 ? "" : "s"} · ${total} s total${tail}`;
}

/** Confirm text: title line, then the first cuts. */
export function createCutsConfirmMessage(cuts, workflowLabel) {
  const n = cuts.length;
  const lines = cuts.slice(0, 8).map((c) => `${c.cut}. ${c.content.slice(0, 60)} (${c.duration}s)`);
  if (n > 8) lines.push(`… and ${n - 8} more`);
  return `Create ${n} cut${n === 1 ? "" : "s"}?\n\nWorkflow: ${workflowLabel}\n${lines.join("\n")}\n\nNothing is queued. Use Queue on a cut to generate it.`;
}

/** Request body for POST /gonggan/cut/add-list. */
export function cutListPayload(pid, cuts, workflow, after) {
  const body = {
    pid,
    workflow: workflow || "t2v",
    cuts: cuts.map((c) => ({ cut: c.cut, duration: c.duration, content: c.content, ltx_prompt: c.ltx_prompt })),
  };
  if (after) body.after = after;
  return body;
}
