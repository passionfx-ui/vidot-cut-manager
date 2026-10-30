import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { trimSecFromDrag, trimArrowGlyph } from "../../web/gg_cuts_core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, "../../web/gonggan.css");

describe("trimSecFromDrag", () => {
  const start = 4;

  it("right edge +dx lengthens", () => {
    assert.equal(trimSecFromDrag("r", start, 1), 5);
  });

  it("right edge -dx shortens", () => {
    assert.equal(trimSecFromDrag("r", start, -1), 3);
  });

  it("left edge -dx lengthens", () => {
    assert.equal(trimSecFromDrag("l", start, -1), 5);
  });

  it("left edge +dx shortens", () => {
    assert.equal(trimSecFromDrag("l", start, 1), 3);
  });
});

describe("trimArrowGlyph", () => {
  it("maps side to outward arrow", () => {
    assert.equal(trimArrowGlyph("r"), ">");
    assert.equal(trimArrowGlyph("l"), "<");
  });
});

describe("trim cursor CSS brackets", () => {
  const css = readFileSync(cssPath, "utf8");
  const block = (side) => css.match(new RegExp(`\\.gg-edge-${side}\\s*\\{[^}]+\\}`))?.[0] ?? "";
  const svg = (side) => decodeURIComponent(block(side).match(/data:image\/svg\+xml,([^")]+)/)?.[1] ?? "");

  it("left edge draws [ (serifs open to the right), right edge draws ]", () => {
    assert.ok(svg("l").includes('d="M15 4H10V20H15"'));
    assert.ok(svg("r").includes('d="M9 4H14V20H9"'));
  });

  it("hotspot sits on the bracket bar, with col-resize fallback", () => {
    assert.match(block("l"), /\) 10 12, col-resize;/);
    assert.match(block("r"), /\) 14 12, col-resize;/);
  });

  it("highlights only the hovered edge", () => {
    assert.match(css, /\.gg-edge-l:hover[^{]*\{[^}]*inset 3px 0 0/);
    assert.match(css, /\.gg-edge-r:hover[^{]*\{[^}]*inset -3px 0 0/);
  });
});
