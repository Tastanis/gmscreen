export * as combatEffects from '../../../assets/js/combat/combat-effects.js';
export * as combatGroups from '../../../assets/js/combat/combat-groups.js';
export * as combatLocks from '../../../assets/js/combat/combat-locks.js';
export * as combatRenderer from '../../../assets/js/combat/combat-renderer.js';
export * as combatState from '../../../assets/js/combat/combat-state.js';
export * as combatSync from '../../../assets/js/combat/combat-sync.js';
export * as combatTurns from '../../../assets/js/combat/combat-turns.js';

// Inactive shell entry point. The live board mounts and owns combat directly.
export function initializeCombatTracker(options = {}) {
  const logger = options?.logger ?? null;
  if (logger && typeof logger.warn === 'function') {
    logger.warn('[VTT] Standalone combat tracker shell is inactive; use the board-mounted tracker.');
  }
  return { dispose() {} };
}
