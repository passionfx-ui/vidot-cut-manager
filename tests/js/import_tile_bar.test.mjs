import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { IMPORT_TILE_TIP } from "../../web/gg_version_strip_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  sel: m[1].replace(/\s+/g, " ").trim(),
  body: m[2],
}));
const ruleFor = (sel) => rules.find((r) => r.sel === sel);
const prop = (rule, name) => rule?.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();

const TILE = ".gg-shots .gg-vstrip .gg-vs-import-tile";
const THUMB = ".gg-shots .gg-vstrip .gg-ver-wrap";
const ROW = ".gg-shots .gg-vs-row";

describe("version-row Import button is a thin vertical bar", () => {
  it("is about one third as wide as a thumbnail and stretches the full row", () => {
    const tile = ruleFor(TILE);
    assert.ok(tile, "import tile rule missing");
    const thumbW = Number(String(prop(ruleFor(THUMB), "width")).replace("px", ""));
    const tileW = Number(String(prop(tile, "width")).replace("px", ""));
    assert.ok(thumbW > 0, "thumbnail width missing");
    assert.ok(Number.isFinite(tileW) && tileW > 0, "import bar width missing");
    assert.ok(Math.abs(tileW * 3 - thumbW) <= 4, `width ${tileW}px should be about 1/3 of ${thumbW}px`);
    assert.equal(prop(tile, "align-self"), "stretch", "bar should span the thumbnail row");
    const height = prop(tile, "height");
    assert.ok(height == null || height === "auto" || height === "100%", `fixed height ${height} does not span the row`);
    assert.equal(prop(ruleFor(ROW), "height"), "72px", "thumbnail row keeps a fixed height");
    assert.equal(prop(ruleFor(".gg-shots .gg-vs-body"), "height"), "auto");
    assert.equal(prop(tile, "background"), "#000");
    assert.equal(prop(tile, "display"), "flex");
    assert.equal(prop(tile, "align-items"), "center");
    assert.equal(prop(tile, "justify-content"), "center");
    assert.equal(prop(tile, "line-height"), "1");
  });

  it("keeps the plus, the Import tooltip, and the same click", () => {
    assert.equal(IMPORT_TILE_TIP, "Import");
    assert.match(js, /class="gg-vs-import-tile"\$\{tileDis\} title="\$\{esc\(IMPORT_TILE_TIP\)\}">\+<\/button>/);
    assert.match(
      js,
      /list\.querySelector\("\.gg-vs-import-tile"\)\?\.addEventListener\("click", \(e\) => \{\s*e\.stopPropagation\(\);\s*if \(e\.currentTarget\.disabled\) return;\s*if \(c\.kind === "reference"\) pickReferenceVersionFiles\(c\.id\);\s*else pickVersionImportFiles\(c\.id\);/,
    );
  });
});
