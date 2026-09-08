/** Order zone work without allowing a failed expiration to start later effects. */
export async function runZoneBoundary(when, { expire, tick, occupants, assertCurrent = () => {} }) {
  assertCurrent();
  if (when === 'startOfTurn') {
    if (await expire() === false) throw new Error('Zone expiration was not confirmed.');
    assertCurrent();
    await tick();
    assertCurrent();
    await occupants();
  } else if (when === 'endOfTurn') {
    await tick();
    assertCurrent();
    if (await expire() === false) throw new Error('Zone expiration was not confirmed.');
  }
}
