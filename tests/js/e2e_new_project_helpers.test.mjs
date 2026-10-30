import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_PROJECT_LOCATION, fillNewProjectModal, NEW_PROJECT_MODAL, pickTemplate } from "../e2e/new_project_helpers.mjs";

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../e2e");

/**
 * Records the puppeteer calls the helpers make. Clicking the combo opens the list; the wait right after a
 * mouse click is the pick check, which fails (and closes the list) `missedPicks` times.
 */
function fakePage({ missedPicks = 0 } = {}) {
  const calls = [];
  let listOpen = false;
  let lastMouseClick = false;
  const page = {
    calls,
    waitForSelector: async (sel) => { calls.push(["waitForSelector", sel]); },
    click: async (sel) => {
      calls.push(["click", sel]);
      if (sel === ".gg-tpl-combo") listOpen = true;
    },
    type: async (sel, text) => { calls.push(["type", sel, text]); },
    $eval: async (sel, _fn, value) => {
      calls.push(["$eval", sel, value]);
      return sel === ".gg-tpl-list" ? listOpen : undefined;
    },
    mouse: {
      click: async (x, y) => {
        calls.push(["mouseClick", x, y]);
        lastMouseClick = true;
      },
    },
    waitForFunction: async (_fn, _opts, arg) => {
      const check = lastMouseClick;
      lastMouseClick = false;
      calls.push([check ? "checkPicked" : "findOption", arg]);
      if (check) {
        listOpen = false;
        if (missedPicks > 0) {
          missedPicks--;
          throw new Error("timeout");
        }
      }
      return { jsonValue: async () => ({ x: 10, y: 20 }) };
    },
  };
  return page;
}

const comboCalls = (page) => page.calls.filter((c) => c[1] === ".gg-tpl-combo");

describe("e2e New Project helpers", () => {
  it("projects made through the window go to a per-process folder under the temp dir", () => {
    assert.equal(path.dirname(E2E_PROJECT_LOCATION), os.tmpdir());
    assert.ok(path.basename(E2E_PROJECT_LOCATION).endsWith(`-${process.pid}`));
  });

  it("fills name and Location; templateRef undefined leaves the template alone", async () => {
    const page = fakePage();
    await fillNewProjectModal(page, { name: "ZZ a" });
    assert.deepEqual(page.calls[0], ["waitForSelector", NEW_PROJECT_MODAL]);
    assert.ok(page.calls.some((c) => c[0] === "type" && c[1] === ".gg-modal-name" && c[2] === "ZZ a"));
    assert.ok(page.calls.some((c) => c[0] === "$eval" && c[1] === ".gg-modal-folder" && c[2] === E2E_PROJECT_LOCATION));
    assert.deepEqual(comboCalls(page), []);
  });

  it("a given location is used as is", async () => {
    const page = fakePage();
    await fillNewProjectModal(page, { name: "ZZ b", location: "D:\\Films" });
    assert.ok(page.calls.some((c) => c[0] === "$eval" && c[1] === ".gg-modal-folder" && c[2] === "D:\\Films"));
  });

  it('templateRef "" picks (none) without typing a filter', async () => {
    const page = fakePage();
    await fillNewProjectModal(page, { name: "ZZ c", templateRef: "" });
    assert.deepEqual(comboCalls(page), [["click", ".gg-tpl-combo"]]);
    assert.ok(page.calls.some((c) => c[0] === "findOption" && c[1] === "(none)"));
    assert.deepEqual(page.calls.at(-1), ["checkPicked", ""]);
  });

  it("a template ref is typed as the filter and its option clicked at its position", async () => {
    const page = fakePage();
    await pickTemplate(page, "films/draft.json");
    assert.deepEqual(comboCalls(page), [["click", ".gg-tpl-combo"], ["type", ".gg-tpl-combo", "films/draft.json"]]);
    assert.ok(page.calls.some((c) => c[0] === "findOption" && c[1] === "films/draft.json"));
    assert.ok(page.calls.some((c) => c[0] === "mouseClick" && c[1] === 10 && c[2] === 20));
    assert.deepEqual(page.calls.at(-1), ["checkPicked", "films/draft.json"]);
  });

  it("a missed pick reopens the list, retypes the filter and clicks again", async () => {
    const page = fakePage({ missedPicks: 1 });
    await pickTemplate(page, "films/draft.json");
    assert.deepEqual(comboCalls(page), [
      ["click", ".gg-tpl-combo"], ["type", ".gg-tpl-combo", "films/draft.json"],
      ["click", ".gg-tpl-combo"], ["type", ".gg-tpl-combo", "films/draft.json"],
    ]);
    assert.equal(page.calls.filter((c) => c[0] === "mouseClick").length, 2);
  });

  it("gives up after the last try", async () => {
    const page = fakePage({ missedPicks: 5 });
    await assert.rejects(pickTemplate(page, "", { tries: 2 }), /Default template "\(none\)" was not picked/);
    assert.equal(page.calls.filter((c) => c[0] === "mouseClick").length, 2);
  });
});

describe("e2e tests use current selectors and labels", () => {
  const files = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith(".mjs"));
  const read = (f) => fs.readFileSync(path.join(E2E_DIR, f), "utf8");

  it("no action on removed controls (selection bar, top Render, old New Project fields)", () => {
    const stale = /page\.(click|select|type|waitForSelector|\$eval|\$\$eval)\(\s*[`"'][^`"']*\.gg-(selbar|sel-group|sel-ungroup|sel-x|sel-count|render-btn|render-row|modal-tpl|split-text|split-copy|split-preview)\b/;
    const hits = files.flatMap((f) => read(f).split("\n").map((line, i) => [f, i + 1, line]).filter(([, , line]) => stale.test(line)));
    assert.deepEqual(hits.map(([f, n]) => `${f}:${n}`), []);
  });

  it("no removed or renamed menu labels", () => {
    const stale = /"(Render selected|Group into Scene|Remove from Scene|Delete Scene)"/;
    const hits = files.filter((f) => stale.test(read(f)));
    assert.deepEqual(hits, []);
  });
});
