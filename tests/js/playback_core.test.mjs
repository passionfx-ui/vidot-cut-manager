import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bumpPlaybackGen,
  decideVideoSync,
  guardResolvedPlay,
  pauseAllTimelineMedia,
  scheduleVideoPlay,
} from "../../web/gg_playback_core.js";

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

describe("timeline playback generation", () => {
  it("bumpPlaybackGen increments playState.gen", () => {
    const state = { gen: 0, on: true };
    assert.equal(bumpPlaybackGen(state), 1);
    assert.equal(state.gen, 1);
    assert.equal(bumpPlaybackGen(state), 2);
  });

  it("guardResolvedPlay pauses when transport stopped", () => {
    let paused = false;
    const vid = { pause() { paused = true; } };
    guardResolvedPlay(vid, 1, { gen: 1, on: false });
    assert.equal(paused, true);
  });

  it("guardResolvedPlay leaves playing when generation matches", () => {
    let paused = false;
    const vid = { pause() { paused = true; } };
    guardResolvedPlay(vid, 3, { gen: 3, on: true });
    assert.equal(paused, false);
  });

  it("guardResolvedPlay pauses when generation advanced", () => {
    let paused = false;
    const vid = { pause() { paused = true; } };
    guardResolvedPlay(vid, 2, { gen: 5, on: true });
    assert.equal(paused, true);
  });

  it("scheduleVideoPlay skips when not playing", () => {
    let called = false;
    const vid = { play() { called = true; } };
    scheduleVideoPlay(vid, 0, { gen: 0, on: false });
    assert.equal(called, false);
  });

  it("scheduleVideoPlay guards a resolving play promise", async () => {
    let paused = false;
    const vid = {
      play() {
        return Promise.resolve().then(() => {});
      },
      pause() {
        paused = true;
      },
    };
    const state = { gen: 1, on: true };
    scheduleVideoPlay(vid, 1, state);
    state.on = false;
    state.gen = 2;
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(paused, true);
  });
});

import {
  registerTimelineMedia,
  registeredTimelineMediaCount,
  shouldBlockMediaPlay,
  guardMediaWithTransport,
  tickIsCurrent,
} from "../../web/gg_playback_core.js";

function fakeMedia() {
  const ls = {};
  return {
    paused: false,
    pauses: 0,
    pause() { this.paused = true; this.pauses++; },
    addEventListener(t, f) { (ls[t] ||= []).push(f); },
    fire(t) { (ls[t] || []).forEach((f) => f()); },
  };
}

describe("0.9.133 pause reliability", () => {
  it("stop pauses registered media from an old (detached) mount", () => {
    const old = fakeMedia();
    registerTimelineMedia(old);
    assert.ok(registeredTimelineMediaCount() >= 1);
    pauseAllTimelineMedia(null, null);
    assert.equal(old.paused, true);
  });
  it("blocks play while the transport is stopped, not when exempt or playing", () => {
    assert.equal(shouldBlockMediaPlay({ on: false }), true);
    assert.equal(shouldBlockMediaPlay({ on: false }, true), false);
    assert.equal(shouldBlockMediaPlay({ on: true }), false);
  });
  it("play/playing events are undone while stopped", () => {
    const st = { on: true };
    const m = fakeMedia();
    guardMediaWithTransport(m, st);
    guardMediaWithTransport(m, st); // idempotent
    m.fire("play");
    assert.equal(m.pauses, 0);
    st.on = false;
    m.fire("play");
    m.fire("playing");
    assert.equal(m.pauses, 2);
  });
  it("export exemption keeps its own controls working", () => {
    const m = fakeMedia();
    guardMediaWithTransport(m, { on: false }, () => true);
    m.fire("play");
    assert.equal(m.pauses, 0);
  });
  it("stale rAF tick from an older session does not advance", () => {
    const st = { on: true, gen: 0 };
    const g = bumpPlaybackGen(st);
    assert.equal(tickIsCurrent(st, g), true);
    bumpPlaybackGen(st); // stop
    st.on = false;
    assert.equal(tickIsCurrent(st, g), false);
    st.on = true;
    assert.equal(tickIsCurrent(st, g), false);
  });
});
