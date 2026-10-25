import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIST_MODE_KEY,
  normalizeListMode,
  loadListMode,
  saveListMode,
  playCutIdAtTime,
  scrollTopToReveal,
  shouldFollowPlayback,
  shouldDeferRepaint,
  applyFieldOverrides,
  classifySaveFailure,
  isCaptionSaveRejected,
  isSilentFieldSave,
  autoHeightPx,
} from "../../web/gg_story_core.js";

describe("normalizeListMode", () => {
  it("accepts caption and legacy story", () => {
    assert.equal(normalizeListMode("caption"), "caption");
    assert.equal(normalizeListMode("story"), "caption");
  });
  it("maps unknown to info", () => {
    assert.equal(normalizeListMode("x"), "info");
    assert.equal(normalizeListMode(""), "info");
    assert.equal(normalizeListMode(null), "info");
  });
});

describe("loadListMode / saveListMode", () => {
  it("round-trips via storage", () => {
    const m = new Map();
    const storage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
    };
    assert.equal(loadListMode(storage), "info");
    saveListMode(storage, "caption");
    assert.equal(m.get(LIST_MODE_KEY), "caption");
    assert.equal(loadListMode(storage), "caption");
    saveListMode(storage, "story");
    assert.equal(loadListMode(storage), "caption");
    saveListMode(storage, "bogus");
    assert.equal(loadListMode(storage), "info");
  });

  it("never throws on null or throwing storage", () => {
    assert.equal(loadListMode(null), "info");
    saveListMode(null, "caption");
    const bad = {
      getItem: () => { throw new Error("fail"); },
      setItem: () => { throw new Error("fail"); },
    };
    assert.equal(loadListMode(bad), "info");
    saveListMode(bad, "caption");
  });
});

describe("playCutIdAtTime", () => {
  const cuts = [
    { id: "a", sec: 2 },
    { id: "b", sec: 3 },
    { id: "c", sec: 1 },
  ];

  it("empty cuts", () => {
    assert.equal(playCutIdAtTime([], 0), "");
    assert.equal(playCutIdAtTime(null, 1), "");
  });

  it("picks cut by time window", () => {
    assert.equal(playCutIdAtTime(cuts, 0), "a");
    assert.equal(playCutIdAtTime(cuts, 1.99), "a");
    assert.equal(playCutIdAtTime(cuts, 2), "b");
    assert.equal(playCutIdAtTime(cuts, 4.5), "b");
    assert.equal(playCutIdAtTime(cuts, 5), "c");
  });

  it("past end returns last cut", () => {
    assert.equal(playCutIdAtTime(cuts, 100), "c");
  });
});

describe("scrollTopToReveal", () => {
  it("unchanged when row fully visible with margin", () => {
    assert.equal(
      scrollTopToReveal({
        viewHeight: 100,
        rowTop: 20,
        rowHeight: 30,
        scrollTop: 10,
        margin: 5,
      }),
      10,
    );
  });

  it("scrolls up to reveal top", () => {
    assert.equal(
      scrollTopToReveal({
        viewHeight: 100,
        rowTop: 5,
        rowHeight: 20,
        scrollTop: 50,
        margin: 0,
      }),
      5,
    );
  });

  it("scrolls down to reveal bottom", () => {
    assert.equal(
      scrollTopToReveal({
        viewHeight: 100,
        rowTop: 80,
        rowHeight: 40,
        scrollTop: 0,
        margin: 0,
      }),
      20,
    );
  });

  it("clamps at zero", () => {
    assert.equal(
      scrollTopToReveal({
        viewHeight: 100,
        rowTop: 2,
        rowHeight: 10,
        scrollTop: 50,
        margin: 10,
      }),
      0,
    );
  });
});

describe("shouldDeferRepaint", () => {
  it("defers while composing", () => {
    assert.equal(shouldDeferRepaint({ composing: true }), true);
    assert.equal(shouldDeferRepaint({ composing: false }), false);
    assert.equal(shouldDeferRepaint({}), false);
  });
});

describe("shouldFollowPlayback", () => {
  it("highlight only in caption with cut id", () => {
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "info",
        cutId: "x",
        lastCutId: "",
        typingInStory: false,
        groupCollapsed: false,
      }),
      { highlight: false, scroll: false },
    );
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "caption",
        cutId: "",
        lastCutId: "",
        typingInStory: false,
        groupCollapsed: false,
      }),
      { highlight: false, scroll: false },
    );
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "caption",
        cutId: "x",
        lastCutId: "",
        typingInStory: false,
        groupCollapsed: false,
      }),
      { highlight: true, scroll: true },
    );
  });

  it("no scroll when same cut, typing, or collapsed", () => {
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "caption",
        cutId: "x",
        lastCutId: "x",
        typingInStory: false,
        groupCollapsed: false,
      }),
      { highlight: true, scroll: false },
    );
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "caption",
        cutId: "x",
        lastCutId: "y",
        typingInStory: true,
        groupCollapsed: false,
      }),
      { highlight: true, scroll: false },
    );
    assert.deepEqual(
      shouldFollowPlayback({
        mode: "caption",
        cutId: "x",
        lastCutId: "y",
        typingInStory: false,
        groupCollapsed: true,
      }),
      { highlight: true, scroll: false },
    );
  });
});

describe("applyFieldOverrides", () => {
  it("tolerates null", () => {
    assert.equal(applyFieldOverrides(null, {}), null);
    const tl = { cuts: [{ id: "a", notes: "n" }] };
    assert.equal(applyFieldOverrides(tl, null), tl);
  });

  it("copies only allowed keys onto matching cuts", () => {
    const tl = {
      cuts: [
        { id: "a", notes: "old", planned_sec: 1 },
        { id: "b", notes: "b" },
      ],
    };
    applyFieldOverrides(tl, {
      a: { notes: "new", planned_sec: 2, caption: "c", extra: "x" },
      missing: { notes: "z" },
    });
    assert.equal(tl.cuts[0].notes, "new");
    assert.equal(tl.cuts[0].planned_sec, 2);
    assert.equal(tl.cuts[0].caption, "c");
    assert.equal(tl.cuts[0].extra, undefined);
    assert.equal(tl.cuts[1].notes, "b");
  });

  it("applies end_card and needs_redo", () => {
    const tl = { cuts: [{ id: "a" }] };
    applyFieldOverrides(tl, { a: { end_card: true, needs_redo: true } });
    assert.equal(tl.cuts[0].end_card, true);
    assert.equal(tl.cuts[0].needs_redo, true);
  });
});

describe("isSilentFieldSave", () => {
  it("notes and caption only", () => {
    assert.equal(isSilentFieldSave({ notes: "a" }), true);
    assert.equal(isSilentFieldSave({ caption: "b" }), true);
    assert.equal(isSilentFieldSave({ notes: "a", caption: "b" }), true);
    assert.equal(isSilentFieldSave({ needs_redo: true }), false);
  });
});

describe("isCaptionSaveRejected", () => {
  it("detects caption in 400 message", () => {
    assert.equal(isCaptionSaveRejected(400, "unsupported cut fields: caption"), true);
    assert.equal(isCaptionSaveRejected(400, "caption must be a string"), true);
    assert.equal(isCaptionSaveRejected(404, "caption"), false);
  });
});

describe("autoHeightPx", () => {
  it("clamps between min and max", () => {
    assert.equal(autoHeightPx({ scrollHeight: 50, minPx: 40, maxPx: 100 }), 50);
    assert.equal(autoHeightPx({ scrollHeight: 20, minPx: 40, maxPx: 100 }), 40);
    assert.equal(autoHeightPx({ scrollHeight: 200, minPx: 40, maxPx: 100 }), 100);
  });

  it("tolerates bad numbers", () => {
    assert.equal(autoHeightPx({ scrollHeight: NaN, minPx: 30, maxPx: 80 }), 30);
    assert.equal(autoHeightPx({ scrollHeight: undefined, minPx: 25, maxPx: 80 }), 25);
    assert.equal(autoHeightPx({ scrollHeight: 50, minPx: undefined, maxPx: 80 }), 50);
    assert.equal(autoHeightPx({ scrollHeight: 200, minPx: 40, maxPx: NaN }), 200);
  });
});

describe("classifySaveFailure", () => {
  it("route-missing for 404 and 405", () => {
    assert.equal(classifySaveFailure(404), "route-missing");
    assert.equal(classifySaveFailure(405), "route-missing");
    assert.equal(classifySaveFailure("405"), "route-missing");
  });
  it("other statuses are error", () => {
    assert.equal(classifySaveFailure(500), "error");
    assert.equal(classifySaveFailure(undefined), "error");
  });
});
