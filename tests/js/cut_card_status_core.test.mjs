import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutCardIdleWord, cutCardRenderView } from "../../web/gg_cut_card_status_core.js";
import { createProgressTracker } from "../../web/gg_progress_core.js";
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

  it("E2E136 3c: no Idle when Comfy left /queue but regen/status still running", () => {
    const projectId = RUNNING_REGEN_JOB.pid;
    const cutId = RUNNING_REGEN_JOB.cut_id;
    const tracker = createProgressTracker({ graceMs: 0 });
    tracker.registerPrompt("p-sdk", cutId, projectId);
    tracker.syncQueue({
      queue_running: [[1, "p-sdk", {}, {}, []]],
      queue_pending: [],
    });

    const snap = (extra = {}) => {
      const progressCut = tracker.getCutStatus(projectId, cutId);
      const view = cutCardRenderView({
        projectId,
        cutId,
        comfyCutView: extra.comfyCutView ?? null,
        regenJob: extra.regenJob ?? RUNNING_REGEN_JOB,
        progressCut,
      });
      const badge = renderBadgeView(view);
      return cutCardIdleWord({
        hasMedia: !!extra.hasMedia,
        badge,
        regenJob: extra.regenJob ?? RUNNING_REGEN_JOB,
        projectId,
        cutId,
      }).text;
    };

    const w0 = snap({
      comfyCutView: { state: "rendering", percent: 40, count: 1, position: null },
    });
    tracker.syncQueue({ queue_running: [], queue_pending: [] });
    const w1 = snap();
    const w2 = cutCardIdleWord({
      hasMedia: true,
      badge: { show: false, text: "", title: "" },
      regenJob: { ...RUNNING_REGEN_JOB, status: "done" },
      projectId,
      cutId,
    }).text;

    assert.ok(w0 === "Rendering" || w0 === "Generating", w0);
    assert.notEqual(w1, "Idle", `sequence: ${[w0, w1, w2].join(" -> ")}`);
    assert.equal(w2, "Done");
  });

  it("E2E136 3c: idle line follows regen job when render badge is hidden", () => {
    const idle = cutCardIdleWord({
      hasMedia: false,
      badge: { show: false, text: "", title: "" },
      regenJob: RUNNING_REGEN_JOB,
      projectId: RUNNING_REGEN_JOB.pid,
      cutId: RUNNING_REGEN_JOB.cut_id,
    });
    assert.equal(idle.text, "Generating");
  });

  it("E2E136 3b: after SDK regen completes, cut card is Done not stuck Queued", () => {
    const projectId = RUNNING_REGEN_JOB.pid;
    const cutId = RUNNING_REGEN_JOB.cut_id;
    const tracker = createProgressTracker({ graceMs: 0 });
    tracker.registerPrompt("sdk-comfy-prompt", cutId, projectId);
    tracker.syncQueue({ queue_running: [], queue_pending: [] });
    const progressCut = tracker.getCutStatus(projectId, cutId);
    const doneJob = {
      status: "done",
      native: true,
      pid: projectId,
      cut_id: cutId,
      versions: ["v-new"],
    };
    const view = cutCardRenderView({
      projectId,
      cutId,
      regenJob: doneJob,
      progressCut,
    });
    const badge = renderBadgeView(view);
    assert.equal(badge.show, false, `expected no badge, got ${badge.text}`);
    const idle = cutCardIdleWord({ hasMedia: true, badge });
    assert.equal(idle.text, "Done");
  });
});
