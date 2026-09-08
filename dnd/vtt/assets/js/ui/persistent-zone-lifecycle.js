import {resolvePersistentZoneLevelId} from './persistent-zone-geometry.js';

/** Check queued effects against the latest projected board before dispatch. */
export function assertPersistentZoneStillActive(expected,zones) {
  const current=zones.find(zone=>zone?.id===expected?.id);
  if (!current) throw new Error('The zone ended before its queued effects completed.');
  if (current.casterId!==expected.casterId || resolvePersistentZoneLevelId(current)!==resolvePersistentZoneLevelId(expected)) {
    throw new Error('The zone owner or floor changed during execution.');
  }
  for(const key of ['effects','attributeBonuses','template','squares','affects','triggers']) {
    if (JSON.stringify(current[key] ?? null)!==JSON.stringify(expected[key] ?? null)) {
      throw new Error('The zone changed before its queued effects completed.');
    }
  }
}
