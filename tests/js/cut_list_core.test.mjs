import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUT_SPLIT_PROMPT,
  LTX_WORKFLOWS,
  DESCRIPTION_MAX_LEN,
  extractJsonArray,
  extractCutItems,
  validateCutItems,
  parseCutList,
  cutNameOf,
  cutListSummary,
  createCutsConfirmMessage,
  cutListPayload,
  cutListWorkflowOptions,
  OLLAMA_DEFAULT_URL,
  ollamaBaseUrl,
  ollamaModelsQuery,
  pickDefaultModel,
  aiCutSplitPayload,
  ollamaUnavailableText,
} from "../../web/gg_cut_list_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

const item = (cut, duration, description = "A red fox runs through snow, tracking shot.") => ({ cut, duration, description });
const json = (arr) => JSON.stringify(arr, null, 2);

describe("Cut Split prompt", () => {
  it("asks for the JSON array with cut, duration, description and ends with STORY:", () => {
    assert.match(CUT_SPLIT_PROMPT, /Return ONLY a JSON array/);
    for (const k of ['"cut"', '"duration"', '"description"']) assert.ok(CUT_SPLIT_PROMPT.includes(k), k);
    assert.ok(!CUT_SPLIT_PROMPT.includes("ltx_prompt"));
    assert.match(CUT_SPLIT_PROMPT, /never more than 3/);
    assert.match(CUT_SPLIT_PROMPT, /One action per cut/);
    assert.match(CUT_SPLIT_PROMPT, /in English/);
    assert.match(CUT_SPLIT_PROMPT, /video prompt and as the cut name/);
    assert.ok(CUT_SPLIT_PROMPT.trimEnd().endsWith("STORY:"));
  });

  it("offers text to video first (default)", () => {
    assert.equal(LTX_WORKFLOWS[0].id, "t2v");
    assert.ok(LTX_WORKFLOWS.some((w) => w.id === "i2v"));
  });
});

describe("extractJsonArray / extractCutItems", () => {
  it("returns a bare array", () => {
    assert.equal(extractJsonArray('[{"a":1}]'), '[{"a":1}]');
  });

  it("strips ```json fences and surrounding text", () => {
    const text = `Sure! Here are your cuts:\n\`\`\`json\n[{"cut":1,"description":"x [y]"}]\n\`\`\`\nEnjoy.`;
    assert.deepEqual(JSON.parse(extractJsonArray(text)), [{ cut: 1, description: "x [y]" }]);
  });

  it("skips bracketed prose before the array", () => {
    assert.equal(extractJsonArray('Notes [draft] below:\n[{"cut": 1}]'), '[{"cut": 1}]');
  });

  it("handles brackets and escaped quotes inside strings", () => {
    const text = '[{"description":"he said \\"]\\" loudly"}] trailing ]';
    assert.deepEqual(JSON.parse(extractJsonArray(text)), [{ description: 'he said "]" loudly' }]);
  });

  it("returns null when there is no array", () => {
    assert.equal(extractJsonArray("no json here"), null);
    assert.equal(extractJsonArray('{"cut":1}'), null);
    assert.equal(extractJsonArray(""), null);
  });

  it("unwraps {cuts: [...]}, a single other list, or one cut object (Ollama format json)", () => {
    const arr = [item(1, 2)];
    assert.deepEqual(extractCutItems(JSON.stringify({ cuts: arr })).items, arr);
    assert.deepEqual(extractCutItems(JSON.stringify({ shots: arr, title: "t" })).items, arr);
    assert.deepEqual(extractCutItems(JSON.stringify(arr[0])).items, arr);
    assert.match(extractCutItems('{"a": 1}').error, /Expected a JSON array/);
  });
});

describe("validateCutItems (strict, same messages as gg_ltx.validate_cut_list)", () => {
  it("sorts by cut and renumbers", () => {
    const r = validateCutItems([item(5, 3, "B"), item(2, 0.5, "A")]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.cuts, [{ cut: 1, duration: 0.5, description: "A" }, { cut: 2, duration: 3, description: "B" }]);
  });

  it("reads content / ltx_prompt as description (description wins)", () => {
    const r = validateCutItems([
      { cut: 1, duration: 2, content: "Short", ltx_prompt: "Long paragraph" },
      { cut: 2, duration: 2, ltx_prompt: "Only prompt" },
      { cut: 3, duration: 2, description: "Desc", content: "ignored" },
    ]);
    assert.deepEqual(r.cuts.map((c) => c.description), ["Short", "Only prompt", "Desc"]);
  });

  it("makes description one line", () => {
    const r = validateCutItems([item(1, 2, "  line one\n  line two  ")]);
    assert.equal(r.cuts[0].description, "line one line two");
  });

  it("names the item and the field for every problem", () => {
    const r = validateCutItems([
      item(1, 2),
      { cut: 2, duration: 4, description: "x" },
      { cut: "3", duration: "2", description: "" },
      "str",
      { duration: 1, description: 5 },
      item(1, 1),
      { cut: 7, duration: 0.2, description: "y".repeat(DESCRIPTION_MAX_LEN + 1) },
      { cut: 1.5, duration: true, description: "z" },
    ]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.cuts, []);
    assert.deepEqual(r.errors, [
      'Item 2 (cut 2): "duration" must be between 0.5 and 3 seconds (got 4).',
      'Item 3: "cut" must be a whole number from 1 (got "3").',
      'Item 3: "duration" must be a number of seconds (got "2").',
      'Item 3: "description" is missing.',
      'Item 4: must be an object like {"cut": 1, "duration": 2, "description": "..."}.',
      'Item 5: "cut" is missing.',
      'Item 5: "description" must be text (got 5).',
      'Item 6 (cut 1): "cut" 1 is used twice (also item 1).',
      'Item 7 (cut 7): "duration" must be between 0.5 and 3 seconds (got 0.2).',
      'Item 7 (cut 7): "description" is too long (301 characters, max 300).',
      'Item 8: "cut" must be a whole number from 1 (got 1.5).',
      'Item 8: "duration" must be a number of seconds (got true).',
    ]);
  });

  it("list-level errors", () => {
    assert.match(validateCutItems(null).errors[0], /JSON array/);
    assert.deepEqual(validateCutItems([]).errors, ["The cut list is empty."]);
    assert.match(validateCutItems(Array.from({ length: 201 }, (_, i) => item(i + 1, 1))).errors[0], /At most 200/);
  });
});

describe("parseCutList", () => {
  it("parses a fenced LLM answer", () => {
    const text = "Here you go:\n```json\n" + json([item(2, 3, "B"), item(1, 2, "A")]) + "\n```";
    const r = parseCutList(text);
    assert.equal(r.ok, true);
    assert.deepEqual(r.cuts.map((c) => [c.cut, c.description, c.duration]), [[1, "A", 2], [2, "B", 3]]);
    assert.equal(cutListSummary(r), "2 cuts · 5 s total");
  });

  it("fails on empty input, no array, bad JSON, empty array", () => {
    assert.match(parseCutList("").errors[0], /Paste the JSON/);
    assert.match(parseCutList("hello").errors[0], /No JSON array/);
    assert.match(parseCutList('[{"cut": 1,}]').errors[0], /Not valid JSON/);
    assert.match(parseCutList("[]").errors[0], /empty/);
  });

  it("does not clamp: durations over 3 s are errors", () => {
    const r = parseCutList(json([item(1, 5)]));
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /^Item 1 \(cut 1\): "duration"/);
  });

  it("cut name is the first 80 characters of the description", () => {
    assert.equal(cutNameOf("x".repeat(100)).length, 80);
    assert.equal(cutNameOf("Short"), "Short");
  });
});

describe("confirm + payload", () => {
  it("confirm title is Create N cuts?", () => {
    const cuts = parseCutList(json([item(1, 2), item(2, 3)])).cuts;
    const { title, body } = splitConfirmMessage(createCutsConfirmMessage(cuts, "Text to video"));
    assert.equal(title, "Create 2 cuts?");
    assert.match(body, /Text to video/);
    assert.match(body, /A red fox runs/);
    assert.match(body, /Nothing is queued/);
    assert.match(body, /Select the cuts and press Queue/);
  });

  it("lists at most 8 cuts", () => {
    const cuts = parseCutList(json(Array.from({ length: 10 }, (_, i) => item(i + 1, 1)))).cuts;
    assert.match(createCutsConfirmMessage(cuts, "W"), /and 2 more/);
  });

  it("payload sends {cut, duration, description} and passes after only when set", () => {
    const cuts = parseCutList(json([item(1, 3)])).cuts;
    assert.deepEqual(cutListPayload("p", cuts, "t2v", ""), {
      pid: "p", workflow: "t2v", cuts: [{ cut: 1, duration: 3, description: "A red fox runs through snow, tracking shot." }],
    });
    assert.equal(cutListPayload("p", cuts, "", "c1").after, "c1");
    assert.equal("workflow" in cutListPayload("p", cuts, "", "c1"), false, "no workflow = the project's Video template");
  });

  it("workflow choices start with the project's Video template (0.9.117)", () => {
    const opts = cutListWorkflowOptions({ video_template: "builtin:video-ltx-t2v" });
    assert.deepEqual(opts.map((o) => o.id), ["", "t2v", "i2v"]);
    assert.equal(opts[0].label, "Project Video template (Video LTX text-to-video)");
    assert.equal(cutListWorkflowOptions(null)[0].label, "Project Video template (Video LTX (default))");
    assert.equal(cutListWorkflowOptions({ video_template: "my/ltx.json" })[0].label, "Project Video template (my/ltx.json)");
  });
});

describe("AI Cut Split helpers", () => {
  it("base URL: trimmed, no trailing slash, blank = server default", () => {
    assert.equal(ollamaBaseUrl(" http://box:11434/ "), "http://box:11434");
    assert.equal(ollamaBaseUrl(undefined), "");
    assert.equal(ollamaModelsQuery(""), "");
    assert.equal(ollamaModelsQuery("http://box:1/"), "?base_url=http%3A%2F%2Fbox%3A1");
  });

  it("request: keep_loaded false by default, base_url only when set", () => {
    assert.deepEqual(aiCutSplitPayload({ story: "S", model: "qwen2.5:7b" }), { story: "S", model: "qwen2.5:7b", keep_loaded: false });
    assert.deepEqual(aiCutSplitPayload({ story: "S", model: "m", keepLoaded: true, baseUrl: "http://x:1/" }),
      { story: "S", model: "m", keep_loaded: true, base_url: "http://x:1" });
  });

  it("default model: last used, else qwen2.5, else first", () => {
    assert.equal(pickDefaultModel(["llama3:8b", "qwen2.5:7b"], "llama3:8b"), "llama3:8b");
    assert.equal(pickDefaultModel(["llama3:8b", "qwen2.5:7b"], "gone"), "qwen2.5:7b");
    assert.equal(pickDefaultModel(["llama3:8b"], ""), "llama3:8b");
    assert.equal(pickDefaultModel([], ""), "");
  });

  it("unreachable text names the URL and the Paste Cut List backup", () => {
    const t = ollamaUnavailableText({ code: "unreachable", url: "" });
    assert.match(t, new RegExp(`^Ollama not running at ${OLLAMA_DEFAULT_URL.replace(/\./g, "\\.")}\\.`));
    assert.match(t, /Paste Cut List/);
    assert.match(ollamaUnavailableText({ code: "no_models", url: "http://h:1" }), /No models installed in Ollama at http:\/\/h:1.*ollama pull/);
    assert.match(ollamaUnavailableText({ code: "http", message: "Ollama error 500: boom" }), /^Ollama error 500: boom/);
  });
});
