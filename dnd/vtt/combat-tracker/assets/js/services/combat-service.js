// Service placeholder for reading and writing combat tracker state.
// Expected to expose methods like `loadState(sceneId)` and `saveState(payload)` with
// debounced writes to prevent overwhelming the PHP backend.
export const combatService = {
  async loadState() {
    throw new Error('combatService.loadState not implemented');
  },
  async saveState() {
    throw new Error('combatService.saveState not implemented');
  }
};
