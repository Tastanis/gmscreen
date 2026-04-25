export function createSyncService({
  startBoardStateSync = null,
  subscribeToBoardState = null,
} = {}) {
  return {
    start(options = {}) {
      if (typeof startBoardStateSync === 'function') {
        return startBoardStateSync(options);
      }
      if (typeof subscribeToBoardState === 'function') {
        return subscribeToBoardState(options);
      }
      return () => {};
    },
  };
}

export const syncService = createSyncService();
