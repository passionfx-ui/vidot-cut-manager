import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { projectRowButtonsOrderedPlusBeforeGear } from "../../web/gg_proj_list_refresh_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const headStart = js.indexOf('<div class="gg-head">');
const head = js.slice(headStart, js.indexOf('<div class="gg-shot-summary">', headStart));
const projRow = head.match(/<div class="gg-proj-row">([\s\S]*?)\n\s*<\/div>/)?.[1] || "";
const pos = (s) => head.indexOf(s);

describe("Shots header layout", () => {
  it("has exactly one Shots header template", () => {
    assert.ok(headStart >= 0);
    assert.equal(js.split('<div class="gg-head">').length, 2);
  });

  it("puts the SDK status above the Project row", () => {
    assert.ok(pos('class="gg-sdk-slot"') >= 0);
    assert.ok(pos('class="gg-proj-row"') > pos('class="gg-sdk-slot"'));
  });

  it("has no Render / Queue row in the header (Queue lives in the status panel)", () => {
    assert.equal(pos("gg-render-row"), -1);
    assert.equal(pos("gg-render-btn"), -1);
    assert.equal(pos("gg-queue-btn"), -1);
    assert.equal(pos("gg-batch-prog"), -1);
  });

  it("puts New project (+) before Project settings gear, with no Reload button", () => {
    const buttons = [...projRow.matchAll(/<button[^>]*class="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(buttons, ["gg-btn gg-new-project-head", "gg-btn gg-proj-settings"]);
    assert.equal(head.indexOf("gg-reload"), -1);
    assert.equal(js.indexOf("gg-reload"), -1);
    assert.ok(projectRowButtonsOrderedPlusBeforeGear(buttons));
    assert.match(projRow, /gg-new-project-head[^>]*aria-label="New Project"/);
    assert.match(projRow, /gg-new-project-head[^>]*>\+<\/button>/);
  });

  it("refreshes project list when opening the project select", () => {
    assert.match(js, /onProjectSelectOpenIntent/);
    assert.match(js, /refreshProjectListForDropdown/);
  });
});
