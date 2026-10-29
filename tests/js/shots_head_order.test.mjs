import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

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

  it("puts the SDK status row above the Project row", () => {
    assert.ok(pos('class="gg-sdk-slot"') >= 0);
    assert.ok(pos('class="gg-render-row"') > pos('class="gg-sdk-slot"'));
    assert.ok(pos('class="gg-proj-row"') > pos('class="gg-render-row"'));
  });

  it("puts Reload right after the Project settings gear, inside the Project row", () => {
    const buttons = [...projRow.matchAll(/<button[^>]*class="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(buttons, ["gg-btn gg-proj-settings", "gg-btn gg-reload"]);
    assert.equal(head.split("gg-reload").length, 2, "only one Reload in the header");
  });

  it("keeps the Reload click handler", () => {
    assert.match(js, /root\.querySelector\("\.gg-reload"\)\?\.addEventListener\("click"/);
  });
});
