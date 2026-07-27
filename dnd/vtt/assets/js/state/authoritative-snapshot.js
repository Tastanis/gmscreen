import { mergeBoardStateSnapshot } from '../utils/merge-helpers.js';
import { shouldApplyIncomingVersion } from './version-guard.js';

/**
 * Merge a full server snapshot only when it is newer than the last board
 * version already applied by this client.
 *
 * Keeping the freshness check and the authoritative merge in one operation
 * prevents callers from accidentally replacing the board before checking the
 * response version (notably when two save/intent responses arrive in reverse
 * order).
 */
export function applyFreshAuthoritativeSnapshot(
  currentBoardState,
  incomingBoardState,
  lastAppliedVersion,
  { mergeFn = mergeBoardStateSnapshot } = {}
) {
  if (!incomingBoardState || typeof incomingBoardState !== 'object') {
    return {
      applied: false,
      boardState: currentBoardState,
      version: lastAppliedVersion,
    };
  }

  const incomingVersion = incomingBoardState._version;
  if (!shouldApplyIncomingVersion(incomingVersion, lastAppliedVersion)) {
    return {
      applied: false,
      boardState: currentBoardState,
      version: lastAppliedVersion,
    };
  }

  const current =
    currentBoardState && typeof currentBoardState === 'object'
      ? currentBoardState
      : {};
  const boardState = mergeFn(
    current,
    { ...incomingBoardState, _fullSync: true },
    { authoritative: true }
  );
  boardState._version = incomingVersion;

  return {
    applied: true,
    boardState,
    version: incomingVersion,
  };
}
