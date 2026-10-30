import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as core from "../../web/gg_cut_list_core.js";
import {
  DESCRIPTION_MAX_LEN,
  extractJsonArray,
  extractCutItems,
  validateCutItems,
  parseCutList,
  cutNameOf,
  cutListSummary,
  createCutsConfirmMessage,
  cutListPayload,
  cutListWorkflow,
  aiCutSplitStatusText,
} from "../../web/gg_cut_list_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

const item = (cut, duration, description = "A red fox runs through snow, tracking shot.") => ({ cut, duration, description });
const json = (arr) => JSON.stringify(arr, null, 2);

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

  it("unwraps {cuts: [...]}, a single other list, or one cut object", () => {
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
    assert.deepEqual(parseCutList("").errors, ["The answer is empty."]);
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

  it("new cuts use the project's Video template (0.9.117)", () => {
    assert.deepEqual(cutListWorkflow({ video_template: "builtin:video-ltx-t2v" }),
      { id: "", label: "Project Video template (Video LTX text-to-video)" });
    assert.equal(cutListWorkflow(null).label, "Project Video template (Video LTX (default))");
    assert.equal(cutListWorkflow({ video_template: "my/ltx.json" }).label, "Project Video template (my/ltx.json)");
  });
});

describe("AI Cut Split (0.9.122: TextGenerate through the Comfy SDK)", () => {
  it("status line: summary, model, retries only when there were any", () => {
    const parsed = parseCutList(json([item(1, 2), item(2, 3)]));
    assert.equal(aiCutSplitStatusText(parsed, { model: "qwen3vl_4b_int8_convrot.safetensors", attempts: 1 }),
      "2 cuts · 5 s total · qwen3vl_4b_int8_convrot.safetensors");
    assert.equal(aiCutSplitStatusText(parsed, { model: "m", attempts: 2 }), "2 cuts · 5 s total · m · 1 retry");
    assert.equal(aiCutSplitStatusText(parsed, { attempts: 3 }), "2 cuts · 5 s total · 2 retries");
    assert.equal(aiCutSplitStatusText(parsed), "2 cuts · 5 s total");
  });

  it("no Ollama, copy prompt or paste helpers are left", () => {
    for (const name of ["CUT_SPLIT_PROMPT", "LTX_WORKFLOWS", "cutListWorkflowOptions", "OLLAMA_DEFAULT_URL", "ollamaBaseUrl",
      "ollamaModelsQuery", "pickDefaultModel", "aiCutSplitPayload", "ollamaUnavailableText"]) {
      assert.equal(name in core, false, name);
    }
  });

  it("Shots keeps AI Cut Split and drops the Ollama model list, Keep LLM loaded, Copy / Paste buttons", () => {
    const js = readFileSync(new URL("../../web/gonggan.js", import.meta.url), "utf8");
    assert.match(js, /class="gg-btn gg-primary gg-ai-split"/);
    assert.match(js, /postJson\("\/gonggan\/ai-cut-split", \{ story: story\.value \}\)/);
    for (const gone of [/ollama/i, /Keep LLM loaded/, /gg-aisplit-model/, /gg-copy-split/, /gg-paste-cuts/,
      /Copy Cut Split Prompt/, /Paste Cut List/, /openPasteCutListModal/, /copyTextToClipboard/]) {
      assert.doesNotMatch(js, gone);
    }
  });
});
