import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  modalViewportRatioInBand,
  promptExpandFullscreenTitle,
  promptExpandKeyAction,
  promptFieldRowHtml,
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

describe("promptFieldRowHtml", () => {
  it("includes expand control for native cuts", () => {
    const html = promptFieldRowHtml({ text: "a", placeholder: "P", title: "T", native: true });
    assert.match(html, /gg-prompt-expand/);
    assert.match(html, /Expand prompt/);
  });
});

describe("promptExpandFullscreenTitle", () => {
  it("toggles labels", () => {
    assert.equal(promptExpandFullscreenTitle(false), "Fullscreen");
    assert.equal(promptExpandFullscreenTitle(true), "Exit fullscreen");
  });
});
