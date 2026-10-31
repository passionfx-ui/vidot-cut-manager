import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutCardIdleWord, cutCardRenderView } from "../../web/gg_cut_card_status_core.js";
import { renderBadgeView } from "../../web/gg_render_status_core.js";

/** Shape from GET /gonggan/regen/status while sdk_runner is in ComfyUI (E2E 136). */
const RUNNING_REGEN_JOB = {
  status: "running",
  native: true,
  pid: "01a19098-3f60-77be-a648-dffead1ac5b0",
  cut_id: "01a19099-a656-722b-81f4-e2f056fdca99",
  started_at: 1730360000,
  versions: [],
};

describe("cutCardRenderView (SDK Queue path)", () => {
  it("E2E136: regen/status running job shows Generating on the cut card (not idle)", () => {
    const view = cutCardRenderView({
      projectId: RUNNING_REGEN_JOB.pid,
      cutId: RUNNING_REGEN_JOB.cut_id,
      regenJob: RUNNING_REGEN_JOB,
    });
    const badge = renderBadgeView(view);
    assert.equal(badge.show, true);
    assert.equal(badge.text, "Generating");
    const idle = cutCardIdleWord({ hasMedia: false, badge });
    assert.equal(idle.text, "Generating");
  });

  it("preparing SDK POST shows Queued only on the target cut", () => {
    const badge = renderBadgeView(
      cutCardRenderView({
        projectId: "p1",
        cutId: "c1",
        sdkBusyCutId: "c1",
      }),
    );
    assert.equal(badge.text, "Queued");
    assert.equal(
      renderBadgeView(
        cutCardRenderView({ projectId: "p1", cutId: "c2", sdkBusyCutId: "c1" }),
      ).show,
      false,
    );
  });

  it("Comfy progress on the cut shows Generating while /queue running=1", () => {
    const badge = renderBadgeView(
      cutCardRenderView({
        projectId: "p1",
        cutId: "c1",
        progressCut: { state: "running", percent: 40, queuePos: null },
      }),
    );
    assert.equal(badge.text, "Generating");
  });

  it("other cut stays idle when regen job targets one cut", () => {
    assert.equal(
      cutCardRenderView({
        projectId: RUNNING_REGEN_JOB.pid,
        cutId: "other-cut",
        regenJob: RUNNING_REGEN_JOB,
      }),
      null,
    );
  });
});
