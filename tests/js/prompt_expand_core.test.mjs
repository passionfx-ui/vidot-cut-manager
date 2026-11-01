import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  modalViewportRatioInBand,
  promptExpandFullscreenTitle,
  promptExpandKeyAction,
  promptFieldRowHtml,
  captionFieldRowHtml,
  PROMPT_EXPAND_BAR_WIDTH_PX,
  promptTextareaCaretIndex,
} from "../../web/gg_prompt_expand_core.js";

describe("promptExpandKeyAction", () => {
  it("Escape cancels and Ctrl+Enter confirms", () => {
    assert.equal(promptExpandKeyAction({ key: "Escape" }), "cancel");
    assert.equal(promptExpandKeyAction({ key: "Enter", ctrlKey: true }), "confirm");
    assert.equal(promptExpandKeyAction({ key: "Enter", metaKey: true }), "confirm");
    assert.equal(promptExpandKeyAction({ key: "Enter" }), null);
  });
});

describe("modalViewportRatioInBand", () => {
  it("accepts ~52.5% or ~100%", () => {
    assert.equal(modalViewportRatioInBand(0.525, false), true);
    assert.equal(modalViewportRatioInBand(0.65, false), false);
    assert.equal(modalViewportRatioInBand(0.99, true), true);
  });
});

describe("captionFieldRowHtml", () => {
  it("includes expand bar for native cuts", () => {
    const html = captionFieldRowHtml({ text: "line", placeholder: "Cap", title: "T", native: true, cutId: "c1" });
    assert.match(html, /gg-prompt-expand-bar/);
    assert.match(html, /data-cut-id="c1"/);
    assert.match(html, /gg-caption-text/);
    assert.doesNotMatch(html, /class="gg-btn gg-prompt-expand"/);
  });
});

describe("promptFieldRowHtml", () => {
  it("includes expand bar for native cuts", () => {
    const html = promptFieldRowHtml({ text: "a", placeholder: "P", title: "T", native: true });
    assert.equal(PROMPT_EXPAND_BAR_WIDTH_PX, 9);
    assert.match(html, /gg-prompt-expand-bar/);
    assert.match(html, /title="Expand"/);
    assert.doesNotMatch(html, /class="gg-btn gg-prompt-expand"/);
    assert.doesNotMatch(html, /⤢/);
  });
});

describe("promptTextareaCaretIndex", () => {
  it("returns a middle index when clicking inside the field", () => {
    const ta = { value: "0123456789abcdef" };
    const rect = { left: 100, top: 50, right: 300, bottom: 120 };
    ta.getBoundingClientRect = () => rect;
    const idx = promptTextareaCaretIndex(ta, 140, 65);
    assert.ok(idx > 2 && idx < ta.value.length - 2);
  });
});

describe("promptExpandFullscreenTitle", () => {
  it("toggles labels", () => {
    assert.equal(promptExpandFullscreenTitle(false), "Fullscreen");
    assert.equal(promptExpandFullscreenTitle(true), "Exit fullscreen");
  });
});
