import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_CUT_SPLIT_FORMAT_LINE,
  REFERENCE_CATEGORIES,
  parseImportList,
  summarizeImport,
  firstErrorText,
  flattenForCreate,
  buildLlmPrompt,
} from "../../web/gg_import_core.js";

const VALID_SAMPLE = `# Format: auto-cut-split v1
# Scene: Arrival at the station
- Cut: Platform wide shot | 3 | Rain on empty platform, a lone figure walks in.
- Cut: Close on ticket | 2 | "One way, please."
# Scene: Night train
- Cut: Window reflection | 3 | Her face over passing lights.
# References
- Character: Mina
- Place: Old station
`;

describe("gg_import_core", () => {
  it("parses valid sample", () => {
    const r = parseImportList(VALID_SAMPLE);
    assert.equal(r.ok, true);
    assert.equal(r.errors.length, 0);
    assert.equal(r.counts.scenes, 2);
    assert.equal(r.counts.cuts, 3);
    assert.equal(r.counts.references, 2);
    assert.equal(r.scenes[0].name, "Arrival at the station");
    assert.equal(r.scenes[0].cuts[0].sec, 3);
    assert.equal(r.references[0].category, "Character");
    assert.equal(r.references[0].name, "Mina");
  });

  it("defaults when seconds and caption omitted", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: Solo
- Cut: Wide only
- Cut: Named pipes | 4
`;
    const r = parseImportList(text);
    assert.equal(r.ok, true);
    assert.equal(r.scenes[0].cuts[0].sec, 3);
    assert.equal(r.scenes[0].cuts[0].caption, "");
    assert.equal(r.scenes[0].cuts[1].sec, 4);
    assert.equal(r.scenes[0].cuts[1].caption, "");
  });

  it("honors defaultSec option", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: A
- Cut: X
`;
    const r = parseImportList(text, { defaultSec: 5 });
    assert.equal(r.scenes[0].cuts[0].sec, 5);
  });

  it("collects loose cuts before any scene", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
- Cut: Orphan | 2 | hello
# Scene: After
- Cut: In scene | 1 | y
`;
    const r = parseImportList(text);
    assert.equal(r.loose.length, 1);
    assert.equal(r.loose[0].name, "Orphan");
    assert.equal(r.scenes[0].cuts.length, 1);
  });

  it("rejects missing format line", () => {
    const r = parseImportList("# Scene: X\n- Cut: A | 1 | b\n");
    assert.equal(r.ok, false);
    assert.equal(firstErrorText(r), "Line 1: first line must be '# Format: auto-cut-split v1'");
  });

  it("rejects wrong format version with line number", () => {
    const text = `# Format: auto-cut-split v2
# Scene: X
- Cut: A | 1 | b
`;
    const r = parseImportList(text);
    assert.equal(r.ok, false);
    assert.equal(
      firstErrorText(r),
      "Line 1: unsupported format version (expected 'auto-cut-split v1')"
    );
  });

  it("reports unknown line with correct line number", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: X
not a cut line
- Cut: A | 1 | b
`;
    const r = parseImportList(text);
    assert.equal(r.ok, false);
    assert.equal(firstErrorText(r), "Line 3: expected '- Cut: name | seconds | caption'");
  });

  it("rejects bad seconds values", () => {
    for (const [body, line] of [
      ["- Cut: A | 0 | x", 3],
      ["- Cut: A | abc | x", 3],
      ["- Cut: A | 601 | x", 3],
      ["- Cut: A | -1 | x", 3],
    ]) {
      const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}\n# Scene: S\n${body}\n`;
      const r = parseImportList(text);
      assert.equal(r.ok, false, body);
      assert.equal(
        firstErrorText(r),
        `Line ${line}: seconds must be a number between 0 and 600`,
        body
      );
    }
  });

  it("accepts decimal seconds", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 2.5 | ok
`;
    const r = parseImportList(text);
    assert.equal(r.ok, true);
    assert.equal(r.scenes[0].cuts[0].sec, 2.5);
  });

  it("errors when scene has no cuts", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: Empty
# Scene: Full
- Cut: One | 1 | c
`;
    const r = parseImportList(text);
    assert.equal(r.ok, false);
    assert.equal(firstErrorText(r), "Line 2: scene 'Empty' has no cuts");
  });

  it("keeps caption after extra pipe characters", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 3 | part one | part two | end
`;
    const r = parseImportList(text);
    assert.equal(r.ok, true);
    assert.equal(r.scenes[0].cuts[0].caption, "part one | part two | end");
  });

  it("handles CRLF line endings", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}\r\n# Scene: S\r\n- Cut: A | 1 | c\r\n`;
    const r = parseImportList(text);
    assert.equal(r.ok, true);
    assert.equal(r.counts.cuts, 1);
  });

  it("normalizes reference categories case-insensitively and rejects invalid", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 1 | c
# References
- place: Dock
- STYLE: Noir
- BadCat: X
`;
    const r = parseImportList(text);
    assert.equal(r.references[0].category, "Place");
    assert.equal(r.references[1].category, "Style");
    assert.equal(r.ok, false);
    assert.match(firstErrorText(r), /unknown reference category 'BadCat'/);
  });

  it("rejects cut lines inside References", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 1 | c
# References
- Cut: Sneak | 1 | no
`;
    const r = parseImportList(text);
    assert.equal(r.ok, false);
    assert.equal(firstErrorText(r), "Line 5: expected '- Cut: name | seconds | caption'");
  });

  it("summarizeImport uses singular and plural forms", () => {
    const one = parseImportList(`${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 1 | c
# References
- Place: P
`);
    assert.equal(summarizeImport(one), "1 scene, 1 cut, 1 reference will be created");

    const many = parseImportList(VALID_SAMPLE);
    assert.equal(summarizeImport(many), "2 scenes, 3 cuts, 2 references will be created");

    const noRefs = parseImportList(`${AUTO_CUT_SPLIT_FORMAT_LINE}
# Scene: S
- Cut: A | 1 | c
`);
    assert.equal(summarizeImport(noRefs), "1 scene, 1 cut will be created");
  });

  it("reports no cuts when list has only format line", () => {
    const r = parseImportList(`${AUTO_CUT_SPLIT_FORMAT_LINE}\n`);
    assert.equal(r.ok, false);
    assert.equal(firstErrorText(r), "Line 0: No cuts found");
  });

  it("errors when cut count exceeds 1000", () => {
    let text = `${AUTO_CUT_SPLIT_FORMAT_LINE}\n# Scene: Bulk\n`;
    for (let i = 0; i < 1001; i++) {
      text += `- Cut: C${i} | 1 | x\n`;
    }
    const r = parseImportList(text);
    assert.equal(r.ok, false);
    assert.equal(r.counts.cuts, 1000);
    assert.match(firstErrorText(r), /maximum 1000 cuts/);
  });

  it("parses 1000 cuts within 200ms", () => {
    let text = `${AUTO_CUT_SPLIT_FORMAT_LINE}\n# Scene: Perf\n`;
    for (let i = 0; i < 1000; i++) {
      text += `- Cut: Cut${i} | 1 | cap\n`;
    }
    const t0 = performance.now();
    const r = parseImportList(text);
    const elapsed = performance.now() - t0;
    assert.equal(r.ok, true);
    assert.equal(r.counts.cuts, 1000);
    assert.ok(elapsed < 200, `expected <200ms, got ${elapsed.toFixed(1)}ms`);
  });

  it("flattenForCreate orders loose cuts then scenes", () => {
    const text = `${AUTO_CUT_SPLIT_FORMAT_LINE}
- Cut: L1 | 1 | a
- Cut: L2 | 2 | b
# Scene: One
- Cut: S1 | 3 | c
# Scene: Two
- Cut: S2 | 4 | d
`;
    const flat = flattenForCreate(parseImportList(text));
    assert.deepEqual(
      flat.map((x) => [x.scene, x.name]),
      [
        [null, "L1"],
        [null, "L2"],
        ["One", "S1"],
        ["Two", "S2"],
      ]
    );
  });

  it("buildLlmPrompt includes format line and opening guidance", () => {
    const p = buildLlmPrompt();
    assert.ok(p.includes(AUTO_CUT_SPLIT_FORMAT_LINE));
    assert.ok(
      p.startsWith(
        "Split the story below into scenes and cuts using the rules, and output only the result in this format."
      )
    );
  });

  it("exports reference category list", () => {
    assert.deepEqual(REFERENCE_CATEGORIES, [
      "Character",
      "Place",
      "Prop",
      "Style",
      "Other",
    ]);
  });
});
