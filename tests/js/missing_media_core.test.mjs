import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { noMediaText, noMediaThumbClass, versionMedia } from "../../web/gg_missing_media_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const fnBody = (name) => {
  const at = js.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found`);
  return js.slice(at, js.indexOf("\n}\n", at));
};

describe("versionMedia (0.9.102)", () => {
  it("maps a version row to clip media", () => {
    const v = { id: "v1", kind: "video", width: 640, height: 360, seconds: 2, model: "m", source: "native", created: 5 };
    assert.deepEqual(versionMedia(v), { id: "v1", kind: "video", width: 640, height: 360, seconds: 2, model: "m", source: "native" });
    assert.deepEqual(versionMedia({ ...v, missing: false }), versionMedia(v));
  });

  it("is no media for a missing file or no row", () => {
    assert.equal(versionMedia({ id: "v1", kind: "image", missing: true }), null);
    assert.equal(versionMedia(undefined), null);
    assert.equal(versionMedia(null), null);
  });
});

describe("noMediaText", () => {
  it("is the existing viewer blank text", () => {
    assert.equal(noMediaText("1-2", "Door"), "1-2. Door — no media");
  });
});

describe("noMediaThumbClass", () => {
  it("keeps the slot class and swaps media classes for gg-thumb-empty", () => {
    assert.equal(noMediaThumbClass(["gg-thumb", "gg-thumb-img", "gg-thumb-broken"]), "gg-thumb gg-thumb-empty");
    assert.equal(noMediaThumbClass(["gg-clip-thumb", "gg-thumb-vid"]), "gg-clip-thumb gg-thumb-empty");
    assert.equal(noMediaThumbClass(["gg-ver-img", "gg-thumb-img"]), "gg-ver-img gg-thumb-empty");
    assert.equal(noMediaThumbClass(undefined), "gg-thumb-empty");
  });
});

describe("gonggan.js wiring", () => {
  it("thumbHtml(null) is the shared no media placeholder", () => {
    assert.match(fnBody("thumbHtml"), /if \(!media\) return `<div class="\$\{cls\} gg-thumb-empty">no media<\/div>`/);
  });

  it("a thumb load error is replaced by the no media placeholder (img and video)", () => {
    const bind = fnBody("bindThumbFallbacks");
    assert.match(bind, /video\.gg-thumb-vid, img\.gg-thumb-img/);
    assert.match(bind, /showNoMediaThumb\(el\)/);
    const show = fnBody("showNoMediaThumb");
    assert.match(show, /noMediaThumbClass\(el\.classList\)/);
    assert.match(show, /textContent = "no media"/);
    assert.match(show, /replaceWith\(ph\)/);
  });

  it("binds thumb fallbacks on the timeline track and cut panel", () => {
    assert.match(js, /bindThumbFallbacks\(\$r\("\.gg-track"\)\)/);
    assert.match(js, /panel\.innerHTML = cutPanelHtml\(c, labels\);\n\s*bindThumbFallbacks\(panel\);/);
  });

  it("version thumbs (cut panel and version strip) draw the placeholder for a missing version", () => {
    assert.match(fnBody("versionThumbParts"), /v\.missing \? thumbHtml\(null, "gg-ver-img"\)/);
    assert.match(fnBody("cutPanelHtml"), /versionThumbParts\(c, v, tabOpen\)/);
    assert.match(fnBody("versionStripHtml"), /versionThumbParts\(c, byId\.get\(r\.id\), tabOpen\)/);
  });

  it("promote uses versionMedia (missing version = no media)", () => {
    assert.match(fnBody("applyPickLocally"), /c\.media = versionMedia\(v\)/);
    assert.equal(js.includes("mediaFromVersion"), false);
  });

  it("viewer shows the no media blank when the current clip fails to load", () => {
    const show = fnBody("showViewerNoMedia");
    assert.match(show, /el\.dataset\.src !== mediaUrl\(c\.media\.id\)/);
    assert.match(show, /noMediaText\(/);
    const wire = fnBody("wireViewerMedia");
    assert.match(wire, /if \(showViewerNoMedia\(vid\)\) return;/);
    assert.match(wire, /img\?\.addEventListener\("error", \(\) => showViewerNoMedia\(img\)\)/);
  });
});
