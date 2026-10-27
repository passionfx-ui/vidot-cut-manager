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

describe("trim cursor CSS arrows", () => {
  const css = readFileSync(cssPath, "utf8");

  const ARROW_L = "M9%208L5%2012l4%204";
  const ARROW_R = "M15%208l4%204-4%204";
  const SHAFT_L = "M17%2012H5";
  const SHAFT_R = "M7%2012H19";

  it("contains outward arrow path strings", () => {
    assert.ok(css.includes(SHAFT_L));
    assert.ok(css.includes(SHAFT_R));
    assert.ok(css.includes(ARROW_L));
    assert.ok(css.includes(ARROW_R));
  });

  it("left tip x is left of bar x, right tip x is right of bar x", () => {
    const blockL = css.match(/\.gg-edge-l\s*\{[^}]+\}/)?.[0] ?? "";
    const blockR = css.match(/\.gg-edge-r\s*\{[^}]+\}/)?.[0] ?? "";
    const uriL = blockL.match(/data:image\/svg\+xml,([^")]+)/)?.[1] ?? "";
    const uriR = blockR.match(/data:image\/svg\+xml,([^")]+)/)?.[1] ?? "";
    const svgL = decodeURIComponent(uriL);
    const svgR = decodeURIComponent(uriR);
    const barL = Number(svgL.match(/x1="(\d+)"/)?.[1]);
    const barR = Number(svgR.match(/x1="(\d+)"/)?.[1]);
    const tipL = Number(svgL.match(/M9 8L(\d+) 12/)?.[1]);
    const tipR = Number(svgR.match(/M15 8l4 4-4 4/) ? 19 : NaN);
    assert.ok(tipL < barL, `left tip ${tipL} should be < bar ${barL}`);
    assert.ok(tipR > barR, `right tip ${tipR} should be > bar ${barR}`);
  });
});
