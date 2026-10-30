import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideVideoSync, pauseAllTimelineMedia } from "../../web/gg_playback_core.js";

const base = {
  want: 1,
  current: 1,
  duration: 10,
  playing: true,
  paused: false,
  seeking: false,
  readyState: 4,
  lastSeekAt: 0,
  now: 1000,
};

describe("decideVideoSync", () => {
  it("never seeks while seeking", () => {
    const r = decideVideoSync({ ...base, seeking: true, current: 0, want: 5 });
    assert.equal(r.seekTo, null);
  });

  it("rate-limits seeks while playing", () => {
    const r = decideVideoSync({
      ...base,
      current: 0,
      want: 2,
      readyState: 4,
      lastSeekAt: 900,
      now: 1000,
    });
    assert.equal(r.seekTo, null);
    const r2 = decideVideoSync({
      ...base,
      current: 0,
      want: 2,
      lastSeekAt: 500,
      now: 1000,
    });
    assert.equal(r2.seekTo, 2);
  });

  it("drift-seeks on first sync while playing before HAVE_FUTURE_DATA", () => {
    const r = decideVideoSync({
      ...base,
      readyState: 2,
      current: 0,
      want: 2,
      lastSeekAt: 0,
    });
    assert.equal(r.seekTo, 2);
  });

  it("does not drift-seek while playing until HAVE_FUTURE_DATA after first seek", () => {
    const r = decideVideoSync({
      ...base,
      readyState: 2,
      current: 0,
      want: 2,
      lastSeekAt: 100,
      now: 1000,
    });
    assert.equal(r.seekTo, null);
  });

  it("uses tight tolerance when paused", () => {
    const r = decideVideoSync({
      ...base,
      playing: false,
      paused: true,
      current: 1,
      want: 1.05,
      readyState: 1,
    });
    assert.equal(r.seekTo, 1.05);
  });

  it("pauses at end of media", () => {
    const r = decideVideoSync({
      ...base,
      want: 9.97,
      duration: 10,
      paused: false,
    });
    assert.equal(r.pause, true);
    assert.equal(r.seekTo, null);
  });

  it("requests play when playing but paused and ready", () => {
    const r = decideVideoSync({
      ...base,
      paused: true,
      readyState: 2,
    });
    assert.equal(r.play, true);
  });

  it("requests pause when not playing but element is playing", () => {
    const r = decideVideoSync({
      ...base,
      playing: false,
      paused: false,
    });
    assert.equal(r.pause, true);
  });
});

describe("pauseAllTimelineMedia", () => {
  it("pauses viewer videos and scoped media without duplicating", () => {
    const calls = [];
    const mk = () => ({ pause() { calls.push(this); } });
    const vid = mk();
    const next = mk();
    const extra = mk();
    const box = {
      querySelectorAll(sel) {
        assert.equal(sel, "video, audio");
        return [extra];
      },
    };
    pauseAllTimelineMedia({ vid, next, box }, null);
    assert.equal(calls.length, 3);
    assert.equal(calls[0], vid);
    assert.equal(calls[1], next);
    assert.equal(calls[2], extra);
  });

  it("pauses elements under an optional scope root", () => {
    const track = { paused: false, pause() { this.paused = true; } };
    const scope = {
      querySelectorAll(sel) {
        assert.equal(sel, "video, audio");
        return [track];
      },
    };
    pauseAllTimelineMedia(null, scope);
    assert.equal(track.paused, true);
  });
});
