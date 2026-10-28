import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "../../web");

/** User-visible brand strings removed from the UI (internal ids may still use gonggan). */
const FORBIDDEN_IN_WEB = [
  "Gonggan-share",
  "Gonggan shot list",
  "Not started from a Gonggan cut",
  "Reset to Gonggan order",
  "Gonggan order and lengths",
  "공간쉐어",
];

function stripJsComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i];
      out += q;
      i += 1;
      while (i < src.length) {
        out += src[i];
        if (src[i] === "\\") {
          i += 1;
          if (i < src.length) out += src[i];
        } else if (src[i] === q) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (src.startsWith("/*", i)) {
      i += 2;
      while (i < src.length && !src.startsWith("*/", i)) i += 1;
      i += 2;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

describe("branding (user-visible web strings)", () => {
  const jsFiles = readdirSync(webDir).filter((f) => f.endsWith(".js"));

  for (const file of jsFiles) {
    it(`${file} has no forbidden brand literals in code (comments ignored)`, () => {
      const raw = readFileSync(join(webDir, file), "utf8");
      const code = stripJsComments(raw);
      for (const bad of FORBIDDEN_IN_WEB) {
        assert.ok(!code.includes(bad), `${file} must not contain ${JSON.stringify(bad)}`);
      }
    });
  }

  it("gonggan.js user attributes (title/placeholder/tooltip) exclude gonggan except in URLs", () => {
    const text = readFileSync(join(webDir, "gonggan.js"), "utf8");
    const attrRe =
      /(?:title|placeholder|tooltip|aria-label)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/gi;
    let m;
    while ((m = attrRe.exec(text)) !== null) {
      const val = m[1].slice(1, -1);
      if (/\/gonggan\//i.test(val) || val.includes("/api/gonggan")) continue;
      assert.ok(!/gonggan/i.test(val), `attribute value must not contain gonggan: ${val.slice(0, 100)}`);
      assert.ok(!/공간/i.test(val), `attribute value must not contain legacy brand: ${val.slice(0, 100)}`);
    }
  });

  it("README has no Gonggan-share wording", () => {
    const readme = readFileSync(join(__dirname, "../../README.md"), "utf8");
    assert.ok(!readme.includes("gonggan-share"));
    assert.ok(!readme.includes("Gonggan-share"));
  });
});
