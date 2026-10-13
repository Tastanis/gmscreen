// Malice changes on their way to the server. Pure: no board, no page.
//
// Brandon, October 12, 2026: "Malace sometimes pops back or doenst work right. make sure it comes and goes
// correctly. and doesnt pop back."
//
// A change used to be sent as "set Malice to N", N being the page's own copy. Any combat news that arrived before
// the answer overwrote that copy with the old number (the pop back), and any other combat change the page sent in
// that moment carried the old number to the server, which kept it (the pop back that stayed). A second Director
// page did the same to the first.
//
// A change is now sent as an amount, one at a time, and the server does the sum (combat.patch, maliceDelta). While
// any of this page's changes is unanswered the pips keep the number the Director means. Every stored number heard
// meanwhile is kept aside, newest by the combat's own count of changes (its sequence). When the last change has
// been answered the newest is shown: it includes this page's changes and anything another page did in between.
//
//   submit(amount)        sends one amount; resolves with the stored combat ({malice, sequence}) or nothing.
//   show(value)           the page shows this number (called when the last change has been answered).
//   failed(error)         a change was not taken.
export function createMaliceChanges({ submit, show = () => {}, failed = () => {} } = {}) {
  let waiting = 0, flying = false, newest = null;
  const hear = (value, sequence) => {
    if (!Number.isFinite(value)) return;
    const at = Number.isFinite(sequence) ? sequence : 0;
    if (!newest || at >= newest.sequence) newest = { value: Math.max(0, Math.trunc(value)), sequence: at };
  };
  const settle = () => { if (!flying && waiting === 0 && newest) show(newest.value); };
  function next() {
    if (flying || waiting === 0) return;
    const amount = waiting; waiting = 0; flying = true;
    Promise.resolve().then(() => submit(amount))
      .then((stored) => { if (stored) hear(Number(stored.malice), Number(stored.sequence)); })
      // It was not taken: what was waiting behind it is dropped with it, and the pips go back to what is stored.
      .catch((error) => { waiting = 0; failed(error); })
      .finally(() => { flying = false; if (waiting !== 0) next(); else settle(); });
  }
  return {
    /** The Director changed Malice by this much. */
    send(amount) { const whole = Math.trunc(Number(amount) || 0); if (!whole) return; waiting += whole; next(); },
    /** A stored number heard from the server. Returns it when it may be shown now, null while changes are unanswered. */
    heard(value, sequence) { hear(Number(value), Number(sequence)); return flying || waiting !== 0 ? null : (newest ? newest.value : null); },
    /** Combat is over, or another scene: nothing is waiting and nothing is remembered. */
    reset() { waiting = 0; newest = null; },
    get busy() { return flying || waiting !== 0; },
  };
}
