// Runs tasks one at a time, in order.
//
// Each change to a shared record carries the revision the sender believes the record is at. Two
// changes sent at once both carry the same revision, and the server refuses the second. Sending
// them one after the other lets the second read the revision the first has just produced.
// A task that hangs past `stallMs` no longer holds up the rest.
export function createSerialQueue({ stallMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const run = tail.then(() => task());
    const settled = run.then(() => {}, () => {});
    tail = new Promise((resolve) => {
      const timer = setTimer(resolve, stallMs);
      settled.then(() => { clearTimer(timer); resolve(); });
    });
    return run;
  };
}
