import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldScheduleCutWorkflowLoad,
  shouldCancelPendingWorkflowLoad,
  shouldResetOpenTabTracking,
  shouldShowOpenTabMarker,
  isOpenTabCut,
} from "../../web/gg_cut_select_core.js";

describe("shouldScheduleCutWorkflowLoad", () => {
  it("plain click schedules", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({}), true);
  });

  it("multi and range do not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ multi: true }), false);
    assert.equal(shouldScheduleCutWorkflowLoad({ range: true }), false);
  });

  it("fromTimeline does not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true }), false);
  });

  it("fromTimeline with multi/range still does not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true, multi: true }), false);
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true, range: true }), false);
  });
});

describe("shouldCancelPendingWorkflowLoad", () => {
  it("only timeline cancels pending debounced load", () => {
    assert.equal(shouldCancelPendingWorkflowLoad({}), false);
    assert.equal(shouldCancelPendingWorkflowLoad({ fromTimeline: true }), true);
  });
});

describe("shouldResetOpenTabTracking", () => {
  it("plain click resets when graph cut differs", () => {
    assert.equal(
      shouldResetOpenTabTracking({ cutId: "a", graphCutId: "b" }),
      true,
    );
  });

  it("plain click resets when project differs", () => {
    assert.equal(
      shouldResetOpenTabTracking({
        cutId: "a",
        graphCutId: "a",
        projectId: "p1",
        graphProjectId: "p2",
      }),
      true,
    );
  });

  it("fromTimeline never resets", () => {
    assert.equal(
      shouldResetOpenTabTracking({
        fromTimeline: true,
        cutId: "a",
        graphCutId: "b",
      }),
      false,
    );
  });

  it("multi/range never reset", () => {
    assert.equal(
      shouldResetOpenTabTracking({ multi: true, cutId: "a", graphCutId: "b" }),
      false,
    );
  });
});

describe("shouldShowOpenTabMarker", () => {
  it("shows when open cut differs from selection", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: true,
        sameProject: true,
      }),
      true,
    );
  });

  it("hidden when open equals selected", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "a",
        openCutId: "a",
        selectedCutId: "a",
        shotTabOpen: true,
      }),
      false,
    );
  });

  it("hidden when tab not open or wrong project", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: false,
      }),
      false,
    );
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: true,
        sameProject: false,
      }),
      false,
    );
  });

  it("empty ids", () => {
    assert.equal(shouldShowOpenTabMarker({}), false);
    assert.equal(
      shouldShowOpenTabMarker({ cutId: "a", openCutId: "", selectedCutId: "b", shotTabOpen: true }),
      false,
    );
  });

  it("isOpenTabCut alias", () => {
    assert.equal(isOpenTabCut, shouldShowOpenTabMarker);
  });
});
