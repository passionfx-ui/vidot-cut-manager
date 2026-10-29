import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sentence } from "../../web/gg_text_core.js";

describe("sentence", () => {
  it("adds one period between message and tail", () => {
    assert.equal(sentence("Save failed", "Try again."), "Save failed. Try again.");
  });
  it("does not double an existing period", () => {
    assert.equal(sentence("HTTP 500.", "Try again."), "HTTP 500. Try again.");
    assert.equal(sentence("disk full...  ", "Try again."), "disk full. Try again.");
  });
  it("keeps ! and ? endings", () => {
    assert.equal(sentence("Not found?", "Try again."), "Not found? Try again.");
  });
  it("handles empty parts", () => {
    assert.equal(sentence("", "Try again."), "Try again.");
    assert.equal(sentence("Done", ""), "Done.");
    assert.equal(sentence(undefined, undefined), "");
  });
});
