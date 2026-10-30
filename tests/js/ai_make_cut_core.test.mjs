import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  parseCutList,
  runAiMakeCutJob,
  aiMakeCutProgressText,
  aiMakeCutErrorText,
  aiMakeCutResumable,
  formatElapsed,
  AI_MAKE_CUT_LABEL,
  AI_MAKE_CUT_WAIT_MS,
  AI_MAKE_CUT_TIMEOUT_TEXT,
  AI_MAKE_CUT_LOST_TEXT,
  STORY_TOO_LONG_MESSAGE,
} from "../../web/gg_cut_list_core.js";
import { cutCardMenuItems, aiMakeCutMenuItem, AI_MAKE_CUT_MENU_LABEL } from "../../web/gg_ctx_menu_core.js";
import { USE_AI_OFF_TIP } from "../../web/gg_cut_split_model_core.js";

const GONGGAN_JS = readFileSync(new URL("../../web/gonggan.js", import.meta.url), "utf8");

// Story: "A girl finds a paper boat on a rainy street. She picks it up and sees a drawing of a lighthouse inside.
// She follows the gutter stream to the harbor. At the end of the pier, an old lighthouse keeper waves at her.
// She smiles and hands him the boat." — a compact answer as the prompt asks for it (one line, no prose).
const PAPER_BOAT_ANSWER =
  '[{"cut":1,"duration":3,"description":"Wide shot, a girl finds a paper boat on a rainy street"},' +
  '{"cut":2,"duration":2.5,"description":"Close-up, the girl sees a lighthouse drawing inside the paper boat"},' +
  '{"cut":3,"duration":3,"description":"Tracking shot, the girl follows the gutter stream to the rainy harbor"},' +
  '{"cut":4,"duration":2,"description":"Medium shot, an old lighthouse keeper waves at the girl at the pier end"},' +
  '{"cut":5,"duration":2.5,"description":"Close-up, the smiling girl hands the paper boat to the old keeper"}]';
const TRUNCATED_ANSWER = PAPER_BOAT_ANSWER.slice(0, PAPER_BOAT_ANSWER.indexOf("an old lighthouse keeper"));

/** Fake clock + sleep: each sleep moves the clock forward. */
function fakeTime() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}

describe("compact AI Make Cut answer (paper boat story)", () => {
  it("parses into five cuts in order", () => {
    const parsed = parseCutList(PAPER_BOAT_ANSWER);
    assert.equal(parsed.ok, true, parsed.errors.join("\n"));
    assert.deepEqual(parsed.cuts.map((c) => c.cut), [1, 2, 3, 4, 5]);
    assert.deepEqual(parsed.cuts.map((c) => c.duration), [3, 2.5, 3, 2, 2.5]);
    assert.match(parsed.cuts[0].description, /paper boat on a rainy street/);
    assert.match(parsed.cuts[4].description, /hands the paper boat/);
  });

  it("the cut-off answer is not a cut list; the server's too_long code shows the story message", () => {
    assert.equal(parseCutList(TRUNCATED_ANSWER).ok, false);
    assert.equal(aiMakeCutErrorText({ code: "too_long", message: "x" }), "Story too long for one split, try a shorter part.");
    assert.equal(STORY_TOO_LONG_MESSAGE, "Story too long for one split, try a shorter part.");
  });
});

describe("runAiMakeCutJob", () => {
  it("starts in the background and polls until done, reporting progress", async () => {
    const tm = fakeTime();
    const polls = [];
    const progress = [];
    const states = [
      { id: "j1", state: "running", attempt: 1, seconds: 3 },
      { id: "j1", state: "running", attempt: 2, seconds: 90 },
      { id: "j1", state: "done", cuts: JSON.parse(PAPER_BOAT_ANSWER), model: "m", attempts: 2 },
    ];
    const out = await runAiMakeCutJob({
      start: async () => ({ ok: true, job: { id: "j1", state: "running", attempt: 1, seconds: 0 } }),
      poll: async (id) => { polls.push(id); return { ok: true, job: states.shift() }; },
      onProgress: (j) => progress.push(j.seconds),
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.equal(out.kind, "done");
    assert.equal(out.job.cuts.length, 5);
    assert.deepEqual(polls, ["j1", "j1", "j1"]);
    assert.deepEqual(progress, [0, 3, 90]);
  });

  it("a run longer than the old request limits (220 s) is still waited for", async () => {
    const tm = fakeTime();
    const out = await runAiMakeCutJob({
      start: async () => ({ job: { id: "j", state: "running" } }),
      poll: async () => ({ job: tm.now() >= 220_000 ? { id: "j", state: "done", cuts: [] } : { id: "j", state: "running" } }),
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.equal(out.kind, "done");
    assert.ok(tm.now() >= 220_000 && tm.now() < AI_MAKE_CUT_WAIT_MS);
  });

  it("an older server answers the start request with the cuts directly", async () => {
    const out = await runAiMakeCutJob({
      start: async () => ({ ok: true, cuts: [{ cut: 1, duration: 2, description: "x" }], model: "m", attempts: 1 }),
      poll: async () => assert.fail("no poll"),
    });
    assert.equal(out.kind, "done");
    assert.deepEqual(out.job.cuts, [{ cut: 1, duration: 2, description: "x" }]);
  });

  it("a failed run throws with its code (too_long → story message)", async () => {
    const tm = fakeTime();
    await assert.rejects(
      runAiMakeCutJob({
        start: async () => ({ job: { id: "j", state: "running" } }),
        poll: async () => ({ job: { id: "j", state: "error", code: "too_long", message: STORY_TOO_LONG_MESSAGE } }),
        sleep: tm.sleep,
        now: tm.now,
      }),
      (e) => e.code === "too_long" && aiMakeCutErrorText(e) === STORY_TOO_LONG_MESSAGE,
    );
  });

  it("start errors (missing model, busy) are thrown unchanged", async () => {
    const err = Object.assign(new Error("Text model x is missing."), { code: "missing_model", status: 409 });
    await assert.rejects(runAiMakeCutJob({ start: async () => { throw err; }, poll: async () => ({}) }), (e) => e === err);
  });

  it("short poll failures are ignored; the result still arrives", async () => {
    const tm = fakeTime();
    let n = 0;
    const out = await runAiMakeCutJob({
      start: async () => ({ job: { id: "j", state: "running" } }),
      poll: async () => {
        n += 1;
        if (n <= 3) throw Object.assign(new Error("Failed to fetch"), { name: "TypeError" });
        return { job: { id: "j", state: "done", cuts: [] } };
      },
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.equal(out.kind, "done");
  });

  it("gives up after a minute without any answer from ComfyUI", async () => {
    const tm = fakeTime();
    await assert.rejects(
      runAiMakeCutJob({
        start: async () => ({ job: { id: "j", state: "running" } }),
        poll: async () => { throw new Error("Failed to fetch"); },
        sleep: tm.sleep,
        now: tm.now,
      }),
      (e) => e.code === "lost" && e.message === AI_MAKE_CUT_LOST_TEXT,
    );
  });

  it("a run that is gone (404, e.g. after a restart) stops at once", async () => {
    const tm = fakeTime();
    const gone = Object.assign(new Error("This AI Make Cut run is gone"), { status: 404 });
    await assert.rejects(
      runAiMakeCutJob({ start: async () => ({ job: { id: "j", state: "running" } }), poll: async () => { throw gone; }, sleep: tm.sleep, now: tm.now }),
      (e) => e === gone,
    );
  });

  it("stops waiting after 10 minutes (the server keeps the result)", async () => {
    const tm = fakeTime();
    const out = await runAiMakeCutJob({
      start: async () => ({ job: { id: "j", state: "running" } }),
      poll: async () => ({ job: { id: "j", state: "running" } }),
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.equal(out.kind, "timeout");
    assert.equal(AI_MAKE_CUT_WAIT_MS, 600_000);
    assert.ok(tm.now() >= 600_000 && tm.now() < 600_000 + 5_000);
    assert.match(AI_MAKE_CUT_TIMEOUT_TEXT, /open AI Make Cut again later to get the result/);
  });

  it("stops polling when the dialog closes", async () => {
    const tm = fakeTime();
    let open = true;
    let polls = 0;
    const out = await runAiMakeCutJob({
      start: async () => ({ job: { id: "j", state: "running" } }),
      poll: async () => { polls += 1; open = false; return { job: { id: "j", state: "running" } }; },
      isActive: () => open,
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.equal(out.kind, "closed");
    assert.equal(polls, 1);
  });

  it("resumes a run that was already going (no new start)", async () => {
    const tm = fakeTime();
    const out = await runAiMakeCutJob({
      job: { id: "old", state: "running", seconds: 40 },
      start: async () => assert.fail("must not start again"),
      poll: async (id) => ({ job: { id, state: "done", cuts: [] } }),
      sleep: tm.sleep,
      now: tm.now,
    });
    assert.deepEqual([out.kind, out.job.id], ["done", "old"]);
  });

  it("a start answer without a job is an error", async () => {
    await assert.rejects(runAiMakeCutJob({ start: async () => ({ ok: true }), poll: async () => ({}) }), /did not start AI Make Cut/);
  });
});

describe("AI Make Cut texts", () => {
  it("label", () => {
    assert.equal(AI_MAKE_CUT_LABEL, "AI Make Cut");
  });

  it("progress shows the elapsed time and a retry", () => {
    assert.equal(formatElapsed(75), "1:15");
    assert.equal(formatElapsed(undefined), "0:00");
    assert.match(aiMakeCutProgressText({ seconds: 75, attempt: 1, max_attempts: 2 }), /^Making cuts… 1:15\. /);
    assert.match(aiMakeCutProgressText({ seconds: 130, attempt: 2, max_attempts: 2 }), /2:10 · retry 1 of 1/);
  });

  it("error texts", () => {
    assert.equal(aiMakeCutErrorText({ name: "AbortError", message: "aborted" }), AI_MAKE_CUT_TIMEOUT_TEXT);
    assert.equal(aiMakeCutErrorText({ status: 404 }), "Restart ComfyUI to use AI Make Cut (new server route).");
    assert.equal(aiMakeCutErrorText({ status: 409, code: "busy", message: "AI Make Cut is already running." }), "AI Make Cut is already running.");
    assert.equal(aiMakeCutErrorText(null), "AI Make Cut failed.");
  });

  it("a finished run is offered again until its cuts are created", () => {
    const job = { id: "j1", state: "done", cuts: [{ cut: 1 }] };
    assert.equal(aiMakeCutResumable(job, ""), true);
    assert.equal(aiMakeCutResumable(job, "j1"), false);
    assert.equal(aiMakeCutResumable({ ...job, state: "running" }, ""), false);
    assert.equal(aiMakeCutResumable({ ...job, cuts: [] }, ""), false);
    assert.equal(aiMakeCutResumable({ ...job, id: "" }, ""), false);
    assert.equal(aiMakeCutResumable(null, ""), false);
  });
});

describe("AI Make Cut right-click entry", () => {
  it("menu item follows Use AI", () => {
    assert.deepEqual(aiMakeCutMenuItem(true), { key: "aiMakeCut", label: "AI Make Cut…", disabled: false, title: "" });
    assert.deepEqual(aiMakeCutMenuItem(false), { key: "aiMakeCut", label: AI_MAKE_CUT_MENU_LABEL, disabled: true, title: USE_AI_OFF_TIP });
  });

  it("cut card menu lists it after Add Cut on native projects only", () => {
    const keys = (ctx) => cutCardMenuItems(ctx).map((i) => i.key);
    const nat = keys({ native: true, aiMakeCut: true, useAi: true });
    assert.equal(nat.indexOf("aiMakeCut"), nat.indexOf("addCut") + 1);
    assert.ok(!keys({ native: false, aiMakeCut: true, useAi: true }).includes("aiMakeCut"));
    assert.ok(!keys({ native: true, aiMakeCut: false }).includes("aiMakeCut"));
    const off = cutCardMenuItems({ native: true, aiMakeCut: true, useAi: false }).find((i) => i.key === "aiMakeCut");
    assert.deepEqual([off.disabled, off.title], [true, "Turn on Use AI in Project Settings"]);
  });
});

describe("AI Make Cut dialog wiring (gonggan.js)", () => {
  const fn = GONGGAN_JS.slice(GONGGAN_JS.indexOf("function openAiCutSplitModal("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));

  it("starts a background run (10 minute request limit) and polls its status", () => {
    assert.match(body, /postJson\("\/gonggan\/ai-cut-split", \{\s*story: story\.value,\s*captions: captionsSel\.value,\s*background: true,/);
    assert.match(body, /AI_MAKE_CUT_CAPTIONS_KEY/);
    assert.match(body, /getJson\(`\/gonggan\/ai-cut-split\/status\?job=\$\{encodeURIComponent\(id\)\}`\)/);
    assert.match(body, /onProgress: \(j\) => \{[\s\S]*?aiMakeCutProgressText\(j\)/);
    assert.match(body, /err\.textContent = aiMakeCutErrorText\(e\)/);
  });

  it("never loses a finished answer: kept for Create, resumed on reopen", () => {
    assert.match(body, /result \? `Create \$\{n\} cut\$\{n === 1 \? "" : "s"\}`/);
    assert.match(body, /getJson\("\/gonggan\/ai-cut-split\/status"\)/);
    assert.match(body, /aiMakeCutResumable\(job, localStorage\.getItem\(AI_MAKE_CUT_USED_KEY\)/);
    assert.match(body, /localStorage\.setItem\(AI_MAKE_CUT_USED_KEY, result\.id\)/);
    assert.match(body, /void resume\(\);/);
  });

  it("postJson takes a timeout", () => {
    const pj = GONGGAN_JS.slice(GONGGAN_JS.indexOf("async function postJson("));
    assert.match(pj.slice(0, pj.indexOf("\n}\n")), /setTimeout\(\(\) => ctl\.abort\(\), timeoutMs\)/);
  });
});
