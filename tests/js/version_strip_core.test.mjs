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
  cutHasStartImage,
  isStillVersion,
  stripSelectedVid,
  bestButtonState,
  makeVideoButtonState,
  makeVideoPlanOk,
  stripHeaderState,
  BEST_BUTTON_LABEL,
  MAKE_VIDEO_LABEL,
  IMPORT_BUTTON_LABEL,
  MAKE_VIDEO_TIP,
  MAKE_VIDEO_OLD_SERVER,
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
    assert.equal(needsDurationProbe({ id: "a1", kind: "video", animated: true }, cut(), new Map()), false,
      "animated image: a <video> probe cannot read it (0.9.119)");
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
    assert.ok(rows.every((r) => !("starTitle" in r)), "no star on thumbnails (0.9.125)");
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

describe("version row header: Best, Make Video, Import (0.9.125)", () => {
  const vers = () => cut().versions_list;

  it("labels are English and plain", () => {
    assert.deepEqual([BEST_BUTTON_LABEL, MAKE_VIDEO_LABEL, IMPORT_BUTTON_LABEL], ["Best", "Make Video", "Import"]);
    assert.match(MAKE_VIDEO_TIP, /selected image/);
  });

  it("selected version: clicked, else open in the canvas, else Best, else current / newest", () => {
    const c = cut();
    assert.equal(stripSelectedVid(c), "v3", "no Best: current (newest)");
    assert.equal(stripSelectedVid({ ...c, pick: "v2", media: { id: "v2" } }), "v2", "Best");
    assert.equal(stripSelectedVid(c, { open: "v1" }), "v1");
    assert.equal(stripSelectedVid(c, { picked: "v2", open: "v1" }), "v2", "a click wins");
    assert.equal(stripSelectedVid(c, { picked: "gone", open: "also-gone" }), "v3", "unknown ids are ignored");
    assert.equal(stripSelectedVid({ ...c, media: null }), "v3", "no media: newest");
    assert.equal(stripSelectedVid(null), "");
    assert.equal(stripSelectedVid({ id: "c", versions_list: [] }, { picked: "x" }), "");
  });

  it("Best toggles on the selected version: pressed when it is the Best", () => {
    const c = cut({ pick: "v2" });
    assert.deepEqual(bestButtonState({ cut: c, vid: "v2" }), { disabled: false, pressed: true, title: "Best (click to clear)" });
    assert.deepEqual(bestButtonState({ cut: c, vid: "v3" }), { disabled: false, pressed: false, title: "Set the selected version as Best" });
    assert.equal(bestButtonState({ cut: null, vid: "v3" }).disabled, true);
    assert.equal(bestButtonState({ cut: c, vid: "" }).disabled, true);
  });

  it("Make Video: only a still image version of a native project, while idle", () => {
    const c = cut();
    const [video, image, missing] = vers();
    const on = { cut: c, version: image, native: true };
    assert.deepEqual(makeVideoButtonState(on), { disabled: false, title: MAKE_VIDEO_TIP });
    assert.match(makeVideoButtonState({ ...on, version: video }).title, /image version/);
    assert.equal(makeVideoButtonState({ ...on, version: video }).disabled, true);
    assert.equal(makeVideoButtonState({ ...on, version: { id: "a", kind: "video", animated: true } }).disabled, true, "animated image");
    assert.equal(makeVideoButtonState({ ...on, version: { ...image, missing: true } }).disabled, true);
    assert.equal(makeVideoButtonState({ ...on, version: missing }).disabled, true);
    assert.equal(makeVideoButtonState({ ...on, native: false }).disabled, true);
    assert.match(makeVideoButtonState({ ...on, native: false }).title, /read-only/);
    assert.equal(makeVideoButtonState({ ...on, cut: null }).disabled, true);
    assert.equal(makeVideoButtonState({ ...on, version: null }).disabled, true);
    assert.equal(makeVideoButtonState({ ...on, busy: true }).disabled, true);
  });

  it("stripHeaderState wires the three buttons to the selected version", () => {
    const c = cut({ pick: "v2", media: { id: "v2", kind: "image" } });
    const s = stripHeaderState({ cut: c, vid: "v2", native: true });
    assert.equal(s.best.pressed, true);
    assert.equal(s.video.disabled, false);
    assert.deepEqual(s.import, { disabled: false, title: IMPORT_TILE_TIP });
    const v = stripHeaderState({ cut: c, vid: "v3", native: true, sdkBusy: false });
    assert.equal(v.best.pressed, false);
    assert.equal(v.video.disabled, true, "selected is a video");
    assert.equal(stripHeaderState({ cut: c, vid: "v2", native: true, sdkBusy: true }).video.disabled, true);
    assert.equal(stripHeaderState({ cut: c, vid: "v2", native: true, importBusy: true }).import.disabled, true);
    const none = stripHeaderState({});
    assert.ok(none.best.disabled && none.video.disabled && none.import.disabled);
    assert.equal(stripHeaderState({ cut: c, vid: "nope", native: true }).best.disabled, true, "unknown version");
  });

  it("Make Video refuses a plan that starts from another image (server without start_vid)", () => {
    assert.equal(makeVideoPlanOk({ start_version: "v2" }, "v2"), true);
    assert.equal(makeVideoPlanOk({ start_version: "v9" }, "v2"), false);
    assert.equal(makeVideoPlanOk({}, "v2"), false);
    assert.equal(makeVideoPlanOk({ start_version: "v9" }, ""), true, "right-click Image to Video: server picks");
    assert.match(MAKE_VIDEO_OLD_SERVER, /^Restart ComfyUI/);
  });

  it("still image check", () => {
    assert.equal(isStillVersion({ id: "a", kind: "image" }), true);
    for (const v of [null, {}, { id: "a", kind: "video" }, { id: "a", kind: "image", animated: true }, { id: "a", kind: "image", missing: true }]) {
      assert.equal(isStillVersion(v), false, JSON.stringify(v));
    }
  });
});

describe("Image to Video (right-click, 0.9.117) and Make Video", () => {
  const fnBody = (name) => {
    const at = js.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return js.slice(at, js.indexOf("\n}\n", at));
  };

  it("a start image is any image version whose file exists", () => {
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v1", kind: "video" }] }), false);
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v1", kind: "image", missing: true }] }), false);
    assert.equal(cutHasStartImage({ versions_list: [{ id: "v2", kind: "video" }, { id: "v1", kind: "image" }] }), true);
    assert.equal(cutHasStartImage(null), false);
    assert.equal(cutHasStartImage({ versions_list: [{ id: "a1", kind: "video", animated: true }] }), false, "animated webp (0.9.119)");
    assert.equal(cutHasStartImage({ versions_list: [{ id: "a1", kind: "image", animated: true }] }), false);
  });

  it("no separate Image to Video button in the row; Make Video runs imageToVideoCut on the selected image", () => {
    assert.ok(!js.includes("gg-vs-i2v") && !css.includes("gg-vs-i2v"), "Image to Video button removed");
    assert.ok(!js.includes("versionStripLeadingHtml"));
    assert.match(js, /on\("\.gg-vs-video-btn", \(c, vid\) => void imageToVideoCut\(c\.id, \{ startVid: vid \}\)\)/);
    const body = fnBody("imageToVideoCut");
    assert.match(js, /async function imageToVideoCut\(cutId, \{ startVid = "" \} = \{\}\)/);
    assert.match(body, /"\/gonggan\/image-to-video"/);
    assert.match(body, /\.\.\.\(startVid \? \{ start_vid: startVid \} : \{\}\)/);
    assert.match(body, /if \(!makeVideoPlanOk\(plan, startVid\)\) throw new Error\(MAKE_VIDEO_OLD_SERVER\)/);
    assert.ok(body.indexOf("makeVideoPlanOk") < body.indexOf("askConfirm"), "checked before the confirm");
    assert.match(body, /askConfirm\(\{ message: i2vConfirmMessage\(title, plan\) \}\)/);
    assert.match(body, /"\/gonggan\/regen", \{ pid, cut_id: cutId, dry_run: false, confirm: true, plan: plan\.plan \}/);
  });

  it("right-click Image to Video and Import stay in the cut menu", () => {
    assert.match(js, /i2v: \(\) => imageToVideoCut\(cutId\)/);
    assert.match(js, /hasImage: cutHasStartImage\(c\)/);
  });
});

describe("version row header wiring (0.9.125)", () => {
  const fnBody = (name) => {
    const at = js.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return js.slice(at, js.indexOf("\n}\n", at));
  };

  it("header sits above the scrolling body inside the row; Best, Make Video, Import in that order", () => {
    assert.match(js, /<div class="gg-vstrip"[^>]*>\s*\$\{versionStripHeadHtml\(\)\}\s*<div class="gg-vs-body">\s*<div class="gg-vs-list"><\/div>/);
    const head = fnBody("versionStripHeadHtml");
    const order = ["gg-vs-best-btn", "gg-vs-video-btn", "gg-vs-import-btn"].map((c) => head.indexOf(c));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), String(order));
    assert.match(head, /BEST_BUTTON_LABEL[\s\S]*MAKE_VIDEO_LABEL[\s\S]*IMPORT_BUTTON_LABEL/);
  });

  it("header never scrolls; only the thumbnail list scrolls sideways", () => {
    assert.match(css, /\.gg-shots \.gg-vs-head \{[^}]*flex: 0 0 auto;[^}]*height: \d+px;[^}]*overflow: hidden;/);
    assert.match(css, /\.gg-shots \.gg-vstrip \{[^}]*display: flex; flex-direction: column;/);
    assert.match(css, /\.gg-shots \.gg-vs-body \{[^}]*position: relative;[^}]*min-height: 0;/);
  });

  it("buttons: Best toggles, Make Video starts from the selected image, Import is the existing import", () => {
    const at = js.indexOf("const bindStripHeader");
    const body = js.slice(at, js.indexOf("const paintVersionStrip", at));
    assert.match(body, /toggleBest\(c\.id, vid\)/);
    assert.match(body, /on\("\.gg-vs-import-btn", \(c\) => pickVersionImportFiles\(c\.id\)\)/);
    assert.match(body, /if \(e\.currentTarget\.disabled\) return;/);
    assert.match(fnBody("toggleBest"), /setPick\(cutId, c\.pick === vid \? null : vid\)/);
    assert.match(js, /const syncStripHeader = [\s\S]*?stripHeaderState\(\{ cut: c, vid: selVid, native: isNativeProject\(\), sdkBusy: !!sdk\.busy, importBusy: stripImportBusy \}\)/);
  });

  it("clearing Best makes the newest version current again (local, same as the server)", () => {
    const body = fnBody("applyPickLocally");
    assert.match(body, /const clear = vid === null;/);
    assert.match(body, /c\.pick = clear \? null : vid;/);
  });
});

describe("gonggan.js wiring (0.9.118)", () => {
  const fnBody = (name) => {
    const at = js.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return js.slice(at, js.indexOf("\n}\n", at));
  };

  it("the row sits directly below the icon row, above the status panel", () => {
    assert.match(js, /\$\{iconRowHtml\(\)\}\s*<div class="gg-vstrip"[^>]*>\s*\$\{versionStripHeadHtml\(\)\}\s*<div class="gg-vs-body">\s*<div class="gg-vs-list"><\/div>\s*<button[^>]*class="gg-btn gg-vs-newest"[^>]*>‹<\/button>\s*<\/div>\s*<\/div>\s*<div class="gg-cutpanel">/);
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

  it("thumb click only selects (and opens it, as before); right-click keeps Set as Best", () => {
    const at = js.indexOf("const bindStripItems");
    const body = js.slice(at, js.indexOf("const paintVersionStrip", at));
    assert.match(body, /wrap\.addEventListener\("click", \(e\) => \{\s*e\.stopPropagation\(\);\s*selectStripVersion\(c\.id, vid\);\s*\}\);/);
    assert.ok(!/setPick|toggleBest/.test(body.slice(0, body.indexOf("contextmenu"))), "a click never changes Best");
    assert.match(body, /versionStripMenuItems\(row\), \{ best: \(\) => setPick\(c\.id, vid\) \}/);
    assert.match(body, /const selectStripVersion = \(cutId, vid\) => \{\s*Object\.assign\(stripPick, \{ pid: state\.pid, cutId, vid \}\);\s*openVersionWorkflow\(cutId, vid\);/);
  });

  it("thumbnails carry no icons: no star, no play badge, no + tile; Best = highlighted border; video keeps its length", () => {
    const html = fnBody("versionStripHtml");
    assert.match(html, /versionThumbParts\(/);
    for (const gone of ["gg-vs-star", "★", "☆", "▶", "gg-vs-plus", "gg-badge"]) assert.ok(!html.includes(gone), gone);
    for (const gone of ["gg-vs-star", "gg-vs-plus", ".gg-vs-import {"]) assert.ok(!css.includes(gone), gone);
    assert.ok(!js.includes("gg-vs-star") && !js.includes("gg-ver-wrap gg-vs-import"), "star / + tile markup removed");
    assert.match(html, /\$\{r\.best \? " gg-vs-best" : ""\}\$\{sel \? " gg-vs-sel" : ""\}/);
    assert.match(html, /\$\{r\.video \? `<span class="gg-vs-dur"/);
    assert.match(css, /\.gg-shots \.gg-vstrip \.gg-vs-best \.gg-ver \{ border: 2px solid var\(--gg-acc\); \}/);
    assert.match(css, /\.gg-shots \.gg-vs-dur \{ position: absolute; right: 2px; bottom: 2px;/);
    const at = js.indexOf("const paintVersionStrip");
    assert.match(js.slice(at, at + 1200), /bindThumbFallbacks\(list\)/);
  });

  it("thumbnails are about 20% larger than 0.9.118 (72x44)", () => {
    const w = Number(css.match(/\.gg-shots \.gg-vstrip \.gg-ver-wrap \{[^}]*width: (\d+)px/)?.[1]);
    const h = Number(css.match(/\.gg-shots \.gg-vstrip \.gg-ver \{[^}]*height: (\d+)px/)?.[1]);
    assert.ok(w >= 84 && w <= 90, `width ${w}`);
    assert.ok(h >= 51 && h <= 55, `height ${h}`);
  });

  it("no visible Regen; Queue respects Random seed", () => {
    assert.ok(!js.includes("gg-vs-regen"));
    assert.match(js, /\.gg-queue-btn"\)\?\.addEventListener\("click", \(\) => void queueButtonClick\(\)\)/);
    assert.match(js, /gg-random-seed-cb/);
    const qb = fnBody("queueButtonClick");
    assert.match(qb, /action === "single"\) return sdkGenerateNativeCut\(ids\[0\], \{ newSeed: loadRandomSeedOn\(localStorage\) \}\)/);
    assert.match(qb, /action === "generate"\) return startGenerateAll\(ids\)/);
    assert.match(fnBody("startGenerateAll"), /random_seed: loadRandomSeedOn\(localStorage\)/);
    assert.match(fnBody("regenNativeCut"), /sdkGenerateNativeCut\(cutId, \{ newSeed: true \}\)/);
  });
});
