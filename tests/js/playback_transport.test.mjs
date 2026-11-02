import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const js = readFileSync(join(root, "web/gonggan.js"), "utf8");
const css = readFileSync(join(root, "web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function mountTimelineHtml() {
  const at = js.indexOf("function mountTimeline(");
  assert.ok(at >= 0, "mountTimeline missing");
  const start = js.indexOf("root.innerHTML = `", at);
  const end = js.indexOf("`;", start);
  return js.slice(start, end);
}

/** Element that edit mode removes from view, if any. */
function editModeHiddenSelector() {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    sel: m[1].trim(),
    body: m[2],
  }));
  const hit = rules.find((r) => /gg-edit-mode-on/.test(r.sel) && /gg-viewer/.test(r.sel) && /display\s*:\s*none/.test(r.body));
  return hit ? hit.sel : "";
}

describe("timeline play control stays usable", () => {
  it("edit mode does not hide the play button with the left preview", () => {
    const html = mountTimelineHtml();
    const hidden = editModeHiddenSelector();
    if (!hidden) return;
    const viewerAt = html.indexOf('<div class="gg-viewer">');
    const viewerEnd = html.indexOf('<div class="gg-editor">');
    assert.ok(viewerAt >= 0 && viewerEnd > viewerAt);
    const viewerHtml = html.slice(viewerAt, viewerEnd);
    const buttonInViewer = viewerHtml.includes("gg-play-btn");
    const movesTransport = /function applyEditModeTimelineRow\(/.test(js)
      && /gg-transport/.test(js.slice(js.indexOf("function applyEditModeTimelineRow("), js.indexOf("function applyEditModeTimelineRow(") + 1200))
      && /gg-tl-tools/.test(js.slice(js.indexOf("function applyEditModeTimelineRow("), js.indexOf("function applyEditModeTimelineRow(") + 1200));
    assert.ok(!buttonInViewer || movesTransport, "play button is inside the preview edit mode hides, and nothing moves it out");
  });
});
