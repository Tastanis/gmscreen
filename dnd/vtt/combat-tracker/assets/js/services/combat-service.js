import { normalizeCombatState } from '../../../../assets/js/combat/combat-state.js';

export function createCombatService({
  getBoardState = null,
  saveCombatState = null,
} = {}) {
  return {
    loadState(sceneId) {
      const sceneKey = normalizeSceneId(sceneId);
      if (!sceneKey || typeof getBoardState !== 'function') {
        return normalizeCombatState({});
      }

      const boardState = getBoardState() ?? {};
      return normalizeCombatState(boardState?.sceneState?.[sceneKey]?.combat ?? {});
    },

    async saveState(sceneId, combatState) {
      if (typeof saveCombatState !== 'function') {
        throw new Error(
          'Standalone combat tracker storage is disabled; inject board-state combat persistence.'
        );
      }
      return saveCombatState(normalizeSceneId(sceneId), normalizeCombatState(combatState));
    },
  };
}

export const combatService = createCombatService();

function normalizeSceneId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}
