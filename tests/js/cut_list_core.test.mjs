import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUT_SPLIT_PROMPT,
  LTX_WORKFLOWS,
  extractJsonArray,
  parseCutList,
  clampCutDuration,
  cutListSummary,
  createCutsConfirmMessage,
  cutListPayload,
} from "../../web/gg_cut_list_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

const item = (cut, duration, content = "A fox runs", ltx_prompt = "A red fox runs through snow.") => ({ cut, duration, content, ltx_prompt });
const json = (arr) => JSON.stringify(arr, null, 2);

describe("Cut Split prompt", () => {
  it("asks for the JSON array with the four fields and ends with STORY:", () => {
    assert.match(CUT_SPLIT_PROMPT, /Return ONLY a JSON array/);
    for (const k of ['"cut"', '"duration"', '"content"', '"ltx_prompt"']) assert.ok(CUT_SPLIT_PROMPT.includes(k), k);
    assert.match(CUT_SPLIT_PROMPT, /never more than 3/);
    assert.match(CUT_SPLIT_PROMPT, /One action per cut/);
    assert.match(CUT_SPLIT_PROMPT, /in English/);
    assert.match(CUT_SPLIT_PROMPT, /LTX-Video/);
    assert.ok(CUT_SPLIT_PROMPT.trimEnd().endsWith("STORY:"));
  });

  it("offers text to video first (default)", () => {
    assert.equal(LTX_WORKFLOWS[0].id, "t2v");
    assert.ok(LTX_WORKFLOWS.some((w) => w.id === "i2v"));
  });
});

describe("extractJsonArray", () => {
  it("returns a bare array", () => {
    assert.equal(extractJsonArray('[{"a":1}]'), '[{"a":1}]');
  });

  it("strips ```json fences and surrounding text", () => {
    const text = `Sure! Here are your cuts:\n\`\`\`json\n[{"cut":1,"content":"x [y]"}]\n\`\`\`\nEnjoy.`;
    assert.deepEqual(JSON.parse(extractJsonArray(text)), [{ cut: 1, content: "x [y]" }]);
  });

  it("skips bracketed prose before the array", () => {
    const text = 'Notes [draft] below:\n[{"cut": 1}]';
    assert.equal(extractJsonArray(text), '[{"cut": 1}]');
  });

  it("handles brackets and escaped quotes inside strings", () => {
    const text = '[{"content":"he said \\"]\\" loudly"}] trailing ]';
    assert.deepEqual(JSON.parse(extractJsonArray(text)), [{ content: 'he said "]" loudly' }]);
  });

  it("returns null when there is no array", () => {
    assert.equal(extractJsonArray("no json here"), null);
    assert.equal(extractJsonArray('{"cut":1}'), null);
    assert.equal(extractJsonArray(""), null);
  });
});

describe("parseCutList", () => {
  it("parses, sorts by cut and renumbers", () => {
    const r = parseCutList(json([item(2, 2, "B"), item(1, 1.5, "A")]));
    assert.equal(r.ok, true);
    assert.deepEqual(r.cuts.map((c) => [c.cut, c.content, c.duration]), [[1, "A", 1.5], [2, "B", 2]]);
  });

  it("clamps duration to 0.5..3 and flags it", () => {
    const r = parseCutList(json([item(1, 5), item(2, 0.1), item(3, 2)]));
    assert.deepEqual(r.cuts.map((c) => c.duration), [3, 0.5, 2]);
    assert.deepEqual(r.cuts.map((c) => c.clamped), [true, true, false]);
    assert.equal(cutListSummary(r), "3 cuts · 5.5 s total (2 durations clamped to 0.5–3 s)");
  });

  it("accepts numeric strings and a missing cut number", () => {
    const r = parseCutList(json([{ duration: "2.5", content: "A", ltx_prompt: "P" }, { cut: "0", duration: 1, content: "Z", ltx_prompt: "Q" }]));
    assert.equal(r.ok, true);
    assert.deepEqual(r.cuts.map((c) => [c.content, c.duration]), [["Z", 1], ["A", 2.5]]);
  });

  it("trims text fields", () => {
    const r = parseCutList(json([item(1, 2, "  A  ", "  P  ")]));
    assert.equal(r.cuts[0].content, "A");
    assert.equal(r.cuts[0].ltx_prompt, "P");
  });

  it("reports missing fields per cut", () => {
    const r = parseCutList(json([item(1, 2, ""), { cut: 2, content: "B", ltx_prompt: "P" }, "x"]));
    assert.equal(r.ok, false);
    assert.equal(r.cuts.length, 0);
    assert.ok(r.errors.some((e) => e.startsWith("Cut 1") && e.includes("content")));
    assert.ok(r.errors.some((e) => e.startsWith("Cut 2") && e.includes("duration")));
    assert.ok(r.errors.some((e) => e.startsWith("Cut 3")));
  });

  it("fails on empty input, no array, bad JSON, empty array, too many cuts", () => {
    assert.equal(parseCutList("").ok, false);
    assert.match(parseCutList("hello").errors[0], /No JSON array/);
    assert.match(parseCutList('[{"cut": 1,}]').errors[0], /Not valid JSON/);
    assert.match(parseCutList("[]").errors[0], /empty/);
    const many = json(Array.from({ length: 201 }, (_, i) => item(i + 1, 1)));
    assert.match(parseCutList(many).errors[0], /At most 200/);
  });

  it("works on a fenced LLM answer", () => {
    const text = "Here you go:\n```json\n" + json([item(1, 3), item(2, 2)]) + "\n```";
    assert.equal(parseCutList(text).cuts.length, 2);
  });
});

describe("confirm + payload", () => {
  it("confirm title is Create N cuts?", () => {
    const cuts = parseCutList(json([item(1, 2), item(2, 3)])).cuts;
    const { title, body } = splitConfirmMessage(createCutsConfirmMessage(cuts, "Text to video"));
    assert.equal(title, "Create 2 cuts?");
    assert.match(body, /Text to video/);
    assert.match(body, /Nothing is queued/);
  });

  it("lists at most 8 cuts", () => {
    const cuts = parseCutList(json(Array.from({ length: 10 }, (_, i) => item(i + 1, 1)))).cuts;
    assert.match(createCutsConfirmMessage(cuts, "W"), /and 2 more/);
  });

  it("payload drops the clamped flag and passes after only when set", () => {
    const cuts = parseCutList(json([item(1, 9)])).cuts;
    assert.deepEqual(cutListPayload("p", cuts, "t2v", ""), {
      pid: "p", workflow: "t2v", cuts: [{ cut: 1, duration: 3, content: "A fox runs", ltx_prompt: "A red fox runs through snow." }],
    });
    assert.equal(cutListPayload("p", cuts, "", "c1").after, "c1");
    assert.equal(cutListPayload("p", cuts, "", "c1").workflow, "t2v");
  });

  it("clampCutDuration rounds to 2 decimals", () => {
    assert.equal(clampCutDuration(1.234), 1.23);
  });
});
