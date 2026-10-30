import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  SET_BEST_LABEL,
  formatClipDuration,
  importButtonState,
  IMPORT_TILE_TIP,
  i2vButtonState,
  I2V_LABEL,
  cutHasStartImage,
  needsDurationProbe,
  showNewestButton,
  stripScrollLeft,
  versionSeconds,
  versionStripMenuItems,
  versionStripRows,
  wheelToScrollLeft,
} from "../../web/gg_version_strip_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8");

const cut = (extra = {}) => ({
  id: "c1",
  pick: null,
  media: { id: "v3", kind: "video", seconds: 6.2 },
  versions_list: [
    { id: "v3", kind: "video", seconds: null, created: 30 },
    { id: "v2", kind: "image", seconds: null, created: 20 },
    { id: "v1", kind: "video", seconds: 4, created: 10, missing: true },
  ],
  ...extra,
});

describe("formatClipDuration", () => {
  it("is m:ss, rounded, at least 0:01", () => {
    assert.equal(formatClipDuration(6), "0:06");
    assert.equal(formatClipDuration(6.4), "0:06");
    assert.equal(formatClipDuration(5.6), "0:06");
    assert.equal(formatClipDuration(0.2), "0:01");
    assert.equal(formatClipDuration(75), "1:15");
    assert.equal(formatClipDuration(3725), "1:02:05");
  });

  it("is empty when unknown", () => {
    for (const v of [0, -1, null, undefined, NaN, Infinity, "x"]) assert.equal(formatClipDuration(v), "");
  });
});

describe("versionSeconds / needsDurationProbe", () => {
  it("uses the version's own length, else the current media's, else a probed one", () => {
    const c = cut();
    assert.equal(versionSeconds(c.versions_list[2], c), 4);
    assert.equal(versionSeconds(c.versions_list[0], c), 6.2);
    assert.equal(versionSeconds({ id: "v9", kind: "video" }, c), 0);
    assert.equal(versionSeconds({ id: "v9", kind: "video" }, c, new Map([["v9", 3]])), 3);
  });

  it("probes only existing videos with no known length, once", () => {
    const c = cut({ media: { id: "v2", kind: "image" } });
    assert.equal(needsDurationProbe(c.versions_list[0], c, new Map()), true);
    assert.equal(needsDurationProbe(c.versions_list[0], c, new Map([["v3", 0]])), false, "already tried");
    assert.equal(needsDurationProbe(c.versions_list[1], c, new Map()), false, "image");
    assert.equal(needsDurationProbe(c.versions_list[2], c, new Map()), false, "missing file");
    assert.equal(needsDurationProbe(cut().versions_list[0], cut(), new Map()), false, "current media knows it");
  });
});

describe("versionStripRows", () => {
  it("keeps the server order (newest first) and marks latest when no Best is set", () => {
    const rows = versionStripRows(cut());
    assert.deepEqual(rows.map((r) => r.id), ["v3", "v2", "v1"]);
    assert.deepEqual(rows.map((r) => [r.best, r.latest]), [[false, true], [false, false], [false, false]]);
    assert.deepEqual(rows.map((r) => r.duration), ["0:06", "", "0:04"]);
    assert.equal(rows[2].missing, true);
    assert.equal(rows[1].video, false);
    assert.match(rows[0].state, /^Latest/);
  });

  it("marks only the user-set Best (never automatic)", () => {
    const rows = versionStripRows(cut({ pick: "v2", media: { id: "v2", kind: "image" } }));
    assert.deepEqual(rows.map((r) => [r.id, r.best, r.latest]), [["v3", false, false], ["v2", true, false], ["v1", false, false]]);
    assert.equal(rows[1].state, "Best");
    assert.match(rows[1].starTitle, /^Best/);
    assert.equal(rows[0].starTitle, SET_BEST_LABEL);
  });

  it("is empty for no cut or no versions", () => {
    assert.deepEqual(versionStripRows(null), []);
    assert.deepEqual(versionStripRows({ id: "c", versions_list: [] }), []);
    assert.deepEqual(versionStripRows({ id: "c", versions_list: [null, {}] }), []);
  });
});

describe("versionStripMenuItems", () => {
  it("offers Set as Best, off on the Best one", () => {
    assert.deepEqual(versionStripMenuItems({ best: false }), [{ key: "best", label: "Set as Best", disabled: false, title: "" }]);
    const [it0] = versionStripMenuItems({ best: true });
    assert.equal(it0.disabled, true);
  });
});

describe("horizontal scroll", () => {
  it("back-to-newest arrow only when scrolled right", () => {
    assert.equal(showNewestButton(0), false);
    assert.equal(showNewestButton(4), false);
    assert.equal(showNewestButton(30), true);
  });

  it("keeps the scroll for the same cut, left edge (newest) for another", () => {
    assert.equal(stripScrollLeft({ cutId: "a", left: 120 }, "a"), 120);
    assert.equal(stripScrollLeft({ cutId: "a", left: 120 }, "b"), 0);
    assert.equal(stripScrollLeft({ cutId: "", left: 50 }, ""), 0);
    assert.equal(stripScrollLeft(null, "a"), 0);
    assert.equal(stripScrollLeft({ cutId: "a", left: -5 }, "a"), 0);
  });

  it("a vertical wheel scrolls sideways, a sideways wheel is left alone", () => {
    assert.equal(wheelToScrollLeft(0, 100), 100);
    assert.equal(wheelToScrollLeft(0, -40), -40);
    assert.equal(wheelToScrollLeft(60, 10), 0);
    assert.equal(wheelToScrollLeft(0, 0), 0);
    assert.equal(wheelToScrollLeft(undefined, "x"), 0);
  });
});

describe("importButtonState", () => {
  it("is enabled only for a selected cut of a native project", () => {
    assert.deepEqual(importButtonState({ hasCut: true, native: true }), { disabled: false, title: IMPORT_TILE_TIP });
    assert.equal(importButtonState({ hasCut: true, native: false }).disabled, true);
    assert.match(importButtonState({ hasCut: true, native: false }).title, /read-only/);
    assert.equal(importButtonState({ hasCut: false, native: true }).title, "Select a cut to import");
    assert.equal(importButtonState({ hasCut: true, native: true, busy: true }).disabled, true);
  });
});

describe("Image to Video button (0.9.117)", () => {
  const fnBody = (name) => {
    const at = js.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return js.slice(at, js.indexOf("\n}\n", at));
  };

  it("enabled only for a selected native cut with an image version while idle", () => {
    assert.equal(I2V_LABEL, "Image to Video");
    const on = { hasCut: true, native: true, hasImage: true };
    assert.equal(i2vButtonState(on).disabled, false);
    assert.match(i2vButtonState(on).title, /Video template/);
    assert.equal(i2vButtonState({ ...on, native: false }).disabled, true);
    assert.equal(i2vButtonState({ ...on, hasCut: false }).disabled, true);
    assert.equal(i2vButtonState({ ...on, hasImage: false }).title, "This cut has no image version yet");
    assert.equal(i2vButtonState({ ...on, busy: true }).disabled, true);
  });

  it("a start image is any image version whose file exists", () => {
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v1", kind: "video" }] }), false);
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v1", kind: "image", missing: true }] }), false);
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v2", kind: "video" }, { id: "v1", kind: "image" }] }), true);
    assert.equal(cutHasStartImage(null), false);
  });

  it("sits after the import tile and runs imageToVideoCut", () => {
    assert.match(fnBody("versionStripLeadingHtml"), /gg-vs-import[\s\S]*gg-vs-i2v/);
    assert.match(js, /querySelector\("\.gg-vs-i2v"\)\?\.addEventListener\("click", \(e\) => \{\s*e\.stopPropagation\(\);\s*void imageToVideoCut\(cutId\);/);
    const body = fnBody("imageToVideoCut");
    assert.match(body, /"\/gonggan\/image-to-video"/);
    assert.match(body, /askConfirm\(\{ message: i2vConfirmMessage\(title, plan\) \}\)/);
    assert.match(body, /"\/gonggan\/regen", \{ pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan\.plan \}/);
  });
});

describe("gonggan.js wiring (0.9.118)", () => {
  const fnBody = (name) => {
    const at = js.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return js.slice(at, js.indexOf("\n}\n", at));
  };

  it("the row sits directly below the icon row, above the status panel", () => {
    assert.match(js, /\$\{iconRowHtml\(\)\}\s*<div class="gg-vstrip"[^>]*>\s*<div class="gg-vs-list"><\/div>\s*<button[^>]*class="gg-btn gg-vs-newest"[^>]*>‹<\/button>\s*<\/div>\s*<div class="gg-cutpanel">/);
    assert.match(js, /^const SHOW_SEL_BAR = false;$/m);
    assert.ok(!js.includes("gg-list-row") && !css.includes("gg-list-row"), "vertical strip layout removed");
  });

  it("the row is horizontal, fixed height and scrolls sideways only", () => {
    assert.match(css, /\.gg-shots \.gg-vstrip \{[^}]*flex: 0 0 auto;[^}]*height: \d+px;/);
    assert.match(css, /\.gg-shots \.gg-vs-list \{[^}]*overflow-x: auto; overflow-y: hidden;[^}]*flex-direction: row;/);
  });

  it("left arrow and wheel are wired to the horizontal scroll", () => {
    assert.match(js, /scrollTo\(\{ left: 0, behavior: "smooth" \}\)/);
    assert.match(js, /wheelToScrollLeft\(e\.deltaX, e\.deltaY\)/);
    assert.match(js, /closest\("\.gg-vstrip"\)/, "clicks in the row do not clear the cut selection");
  });

  it("thumb click, star and right-click reuse the existing open / pick paths", () => {
    const at = js.indexOf("const bindStripItems");
    const body = js.slice(at, js.indexOf("const paintVersionStrip", at));
    assert.match(body, /openVersionWorkflow\(c\.id, vid\)/);
    assert.match(body, /if \(!row\.best\) setPick\(c\.id, vid\)/);
    assert.match(body, /versionStripMenuItems\(row\), \{ best: \(\) => setPick\(c\.id, vid\) \}/);
  });

  it("strip thumbs use the shared version thumb and no-media fallback", () => {
    assert.match(fnBody("versionStripHtml"), /versionThumbParts\(/);
    const at = js.indexOf("const paintVersionStrip");
    assert.match(js.slice(at, at + 1200), /bindThumbFallbacks\(list\)/);
  });

  it("import + tile is first; no visible Regen; Queue respects Random seed", () => {
    assert.match(fnBody("versionStripLeadingHtml"), /gg-vs-import[\s\S]*gg-vs-plus/);
    assert.ok(!js.includes("gg-vs-regen"));
    assert.match(js, /querySelector\("\.gg-vs-import"\)\?\.addEventListener\("click"/);
    assert.match(js, /\.gg-queue-btn"\)\?\.addEventListener\("click", \(\) => void queueButtonClick\(\)\)/);
    assert.match(js, /gg-random-seed-cb/);
    const qb = fnBody("queueButtonClick");
    assert.match(qb, /action === "single"\) return sdkGenerateNativeCut\(ids\[0\], \{ newSeed: loadRandomSeedOn\(localStorage\) \}\)/);
    assert.match(qb, /action === "all"\) return startGenerateAll\(\)/);
    assert.match(fnBody("startGenerateAll"), /random_seed: loadRandomSeedOn\(localStorage\)/);
    assert.match(fnBody("regenNativeCut"), /sdkGenerateNativeCut\(cutId, \{ newSeed: true \}\)/);
  });
});
