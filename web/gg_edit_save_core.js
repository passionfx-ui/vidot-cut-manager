// Writes that change the server-side timeline edit (/gonggan/edit, /groups, /edit/reset) must
//  1) reach the server one at a time, in the order the user made them, and
//  2) never let an OLD response overwrite what the user changed locally since that request left.
export function createEditSaveGate() {
  let seq = 0;
  let chain = Promise.resolve();
  return {
    // Count one local edit (trim, reorder ...). Returns the new counter.
    bump() {
      seq += 1;
      return seq;
    },
    get seq() {
      return seq;
    },
    // True when no local edit happened after `mark` was read from `seq`.
    isCurrent(mark) {
      return mark === seq;
    },
    // Run fn after every earlier write has finished (fn errors do not break the chain).
    run(fn) {
      const p = chain.then(() => fn());
      chain = p.then(() => {}, () => {});
      return p;
    },
    // Like run(), but a debounced save still waiting is written first: `takePending()` (read when the job
    // starts) returns its write function or null. The flush runs inside this job; calling run() from inside
    // a job waits for that job itself and never settles, which blocks every later write.
    runAfterPending(takePending, fn) {
      return this.run(async () => {
        const flush = takePending();
        if (flush) await flush();
        return fn();
      });
    },
  };
}