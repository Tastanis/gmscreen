/**
 * Decide whether an incoming state update should be applied based on its
 * `_version` relative to the last version the client has already applied.
 *
 * All three realtime ingestion paths (Pusher broadcasts, HTTP poll responses,
 * and the client's own save response) share the same rule: only accept
 * strictly newer versions. Equal versions are skipped so that a save response
 * arriving after Pusher has already broadcast the same change does not cause
 * redundant reapplication or state churn, matching the Pusher guard's
 * `version <= lastAppliedVersion` behavior.
 *
 * @param {unknown} incomingVersion
 *   The `_version` value from the server response, Pusher payload, or poll.
 * @param {unknown} lastAppliedVersion
 *   The highest version the client has already applied locally.
 * @returns {boolean}
 *   True if the caller should apply the incoming update, false if it should
 *   be treated as stale and dropped.
 */
export function shouldApplyIncomingVersion(incomingVersion, lastAppliedVersion) {
  if (typeof incomingVersion !== 'number' || !Number.isFinite(incomingVersion)) {
    return false;
  }
  if (typeof lastAppliedVersion !== 'number' || !Number.isFinite(lastAppliedVersion)) {
    return true;
  }
  return incomingVersion > lastAppliedVersion;
}
