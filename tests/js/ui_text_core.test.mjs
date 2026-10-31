import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsForbiddenUserText, sanitizeUserMessage, sanitizeUserPath } from "../../web/gg_ui_text_core.js";

describe("sanitizeUserMessage", () => {
  it("strips internal folder names and native", () => {
    assert.equal(sanitizeUserMessage("Missing image: gonggan/start_x.png"), "Missing image: start_x.png");
    assert.equal(sanitizeUserMessage("Not available for native projects"), "Not available for projects");
  });
});

describe("sanitizeUserPath", () => {
  it("removes gonggan segment from paths", () => {
    assert.equal(sanitizeUserPath("input/gonggan/start.png"), "input/start.png");
  });
});

describe("containsForbiddenUserText", () => {
  it("detects gonggan and native words", () => {
    assert.equal(containsForbiddenUserText("ok message"), false);
    assert.equal(containsForbiddenUserText("path gonggan/x"), true);
    assert.equal(containsForbiddenUserText("for native use"), true);
  });
});
