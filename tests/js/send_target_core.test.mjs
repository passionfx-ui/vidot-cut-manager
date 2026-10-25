import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSendTarget } from "../../web/gg_send_target_core.js";

const cutIds = ["c1", "c2", "c3"];
const jobs = [
  { promptId: "p1", cutId: "c2", projectId: "proj-a", ts: 1 },
  { promptId: "p0", cutId: "c1", projectId: "proj-a", ts: 2 },
];

describe("resolveSendTarget", () => {
  it("uses job cut when prompt matches project and cut is valid", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "p1",
        jobs,
        projectId: "proj-a",
        selectedCutId: "c1",
        cutIds,
      }),
      { cutId: "c2", redirected: true },
    );
  });

  it("not redirected when selection matches job cut", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "p1",
        jobs,
        projectId: "proj-a",
        selectedCutId: "c2",
        cutIds,
      }),
      { cutId: "c2", redirected: false },
    );
  });

  it("falls back to selected cut when no job match", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "unknown",
        jobs,
        projectId: "proj-a",
        selectedCutId: "c3",
        cutIds,
      }),
      { cutId: "c3", redirected: false },
    );
  });

  it("empty cutId when selection not in list", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "unknown",
        jobs,
        projectId: "proj-a",
        selectedCutId: "bad",
        cutIds,
      }),
      { cutId: "", redirected: false },
    );
  });

  it("ignores job with wrong project", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "p1",
        jobs,
        projectId: "other",
        selectedCutId: "c1",
        cutIds,
      }),
      { cutId: "c1", redirected: false },
    );
  });

  it("ignores job cut not in cutIds", () => {
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: "p1",
        jobs: [{ promptId: "p1", cutId: "gone", projectId: "proj-a" }],
        projectId: "proj-a",
        selectedCutId: "c1",
        cutIds,
      }),
      { cutId: "c1", redirected: false },
    );
  });

  it("tolerates bad input", () => {
    assert.deepEqual(
      resolveSendTarget({}),
      { cutId: "", redirected: false },
    );
    assert.deepEqual(
      resolveSendTarget({
        lastPromptId: null,
        jobs: "nope",
        projectId: "proj-a",
        selectedCutId: "c1",
        cutIds: null,
      }),
      { cutId: "", redirected: false },
    );
  });
});
