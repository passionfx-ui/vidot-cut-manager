import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../web/gonggan.css"), "utf8");
const captionBlock = css.match(/\.gg-shots \.gg-caption-text\s*\{[^}]+\}/)?.[0] ?? "";
const promptBlock = css.match(/\.gg-shots \.gg-prompt-text\s*\{[^}]+\}/)?.[0] ?? "";

describe("prompt field typography matches panel fields", () => {
  it("uses shared CSS variables on caption, prompt, and cut info fields", () => {
    assert.match(css, /--gg-field-text-size:\s*11px/);
    assert.match(css, /--gg-field-text-lh:\s*1\.3/);
    assert.match(captionBlock, /font-family:\s*inherit/);
    assert.match(captionBlock, /font-size:\s*var\(--gg-field-text-size\)/);
    assert.match(captionBlock, /line-height:\s*var\(--gg-field-text-lh\)/);
    assert.match(promptBlock, /font-family:\s*inherit/);
    assert.match(promptBlock, /font-size:\s*var\(--gg-field-text-size\)/);
    assert.match(promptBlock, /line-height:\s*var\(--gg-field-text-lh\)/);
    assert.match(css, /\.gg-shots \.gg-cut-fields\s*\{[^}]*font-size:\s*var\(--gg-field-text-size\)/);
  });
});
