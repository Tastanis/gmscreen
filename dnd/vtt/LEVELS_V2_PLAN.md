# VTT Levels v2 - Plan

This document plans the upgrade of the map-levels system in the VTT. It is written so that another developer (or future session) can understand what we are trying to accomplish and why, even if they choose a different implementation.

If something here conflicts with how you would build it, the Goals sections take priority over the Implementation sections: keep the goal, change the mechanism.

---

## 1. Background

The VTT supports stacking multiple maps in a single scene ("levels"), with grid-cell cutouts in upper levels that reveal levels below. Today:

- The first uploaded map in a scene is the implicit base map and is not part of the levels list. Tokens cannot be assigned to it.
- Tokens carry a `levelId` and can be moved up/down between numbered levels (1, 2, 3...) but never to the base map.
- The active level is a single global value per scene. Every viewer sees the same level as active. Players have no notion of "what level am I on".
- The GM sees every token at every level all the time, with no indication of which level a token belongs to.

The goal of this rework is to:

- Fix the missing base-level affordance.
- Give every user a personal current level that affects what they see.
- Give the GM clear at-a-glance information about which level any token is on.

---

## 2. Concept Glossary

- **Level 0 / Base level** - The first map uploaded to a scene. It behaves like any other level for token placement, the level selector UI, and active-level mechanics. Unlike levels 1+, it cannot have cutouts because there is nothing below it to reveal.
- **Level N** - Stacked maps above the base. Levels 1, 2, 3... keep the existing visible numbering.
- **Stored map levels** - The existing `mapLevels.levels` array. It continues to store only Level 1+ maps. Level 0 is virtual and derived from the scene's base `mapUrl`.
- **Active level (per user)** - The single level a given user is currently on. Determines what tokens render at full size, what tokens are hidden vs. indicated as above/below, and which level new tokens get placed onto.
- **Activate (GM action)** - A GM-only button that forces every known user's active level to match the GM's current viewing level. This is a one-shot push, not a binding subscription.
- **Claim** - A per-scene assignment of a token to a specific user. A claimed token belongs to that user for view-following purposes. The four PC tokens (Indigo, Sharon, Frunk, Zepha) auto-claim to the user with the matching profile id when first dragged into a scene.
- **Cutout edge rule** - A token whose occupied cells are within one grid square of a cutout, treating the cutout as one square larger in every direction, is visible across that cutout. This applies symmetrically: tokens above can be seen from below, and tokens below can be seen from above.
- **Fall** - When a token ends a move entirely inside a raw cutout area, it automatically drops to the next level down. If it lands inside another cutout, it keeps falling until it does not, or until it hits Level 0.

---

## 3. Goals (in priority order)

1. **Tokens can live on the base map.** Treat the base map as Level 0. Everywhere the level UI says "Level 1, 2, 3..." it should now say "Level 0, 1, 2, 3...". Tokens already in scenes do not need to be rewritten.
2. **Each user has a personal active level.** What you see depends on where you are. Players' active level is driven by their claimed token; the GM's is driven by their up/down nav buttons.
3. **GM can pull everyone to a specific level on demand** via an explicit Activate button. Browsing levels with up/down does not affect anyone else.
4. **Tokens above/below the viewer are visually distinct.** Below = green down-arrow + distance and smaller. Above = red up-arrow + distance. Same level = no indicator, full size.
5. **Players cannot see through solid floors/ceilings.** They see same-level tokens normally, and they see lower/upper-level tokens only through cutouts, using the edge rule.
6. **The GM always sees every token, with size and arrow indicators that make level instantly readable** at a glance.
7. **Players can claim NPC tokens** in addition to their PC. The GM can assign any token to any player.

---

## 4. Implementation Decisions That Should Not Drift

These decisions make the plan fit the current codebase more smoothly.

### 4.1 Level identity

- Define a shared constant: `BASE_MAP_LEVEL_ID = "level-0"`.
- `mapLevels.levels` continues to store only Level 1+ maps. Do not persist a fake Level 0 object in that array.
- Level 0 is a view-model entry derived from the scene/base map URL (`scene.mapUrl` / current board `mapUrl`) plus the scene grid.
- The existing base map image remains the visual Level 0. Do not also render the base map as a `map-level-renderer` overlay unless that renderer is refactored to replace the existing base image. Rendering both would duplicate the base map.
- Existing placements with missing, blank, or `null` `levelId` resolve to `BASE_MAP_LEVEL_ID`.
- New writes may persist `placement.levelId = "level-0"` for clarity. Normalizers must still treat missing/null as Level 0 for migration.
- Split the current level helper behavior:
  - `resolvePlacementLevelId(placement)` returns the token's stored level or Level 0.
  - `resolveActiveLevelId(sceneState, userId)` returns the user's current active level.
  - Do not use the user's active level as a fallback for a token that lacks `levelId`; that would move old tokens between levels as users browse.

### 4.2 Per-user state

- Store user keys as normalized profile ids, not display names. Use the same normalized ids the VTT already derives for `gm`, `indigo`, `sharon`, `frunk`, and `zepha`.
- Store active level state as an object, not a bare string:

```jsonc
{
  "levelId": "level-0",
  "source": "manual | activate | claim",
  "tokenId": "optional placement id when source is claim",
  "updatedAt": 1710000000000
}
```

- Resolve a user's active level in this order:
  1. Valid `userLevelState[userId].levelId`.
  2. If missing or invalid and the user has claimed tokens, the current level of the most recently modified claimed token.
  3. Level 0.
- Whenever a claimed token changes level for any reason, the same mutation must update that claimant's `userLevelState` to `{ levelId, source: "claim", tokenId, updatedAt }`. This keeps reload persistence and "follow your token" from fighting each other.
- Activate writes `{ levelId: gmLevelId, source: "activate", updatedAt }` for every known user. The next claimed-token level change overwrites that user's entry with `source: "claim"`.
- If multiple claimed tokens for one user change level in one operation, the last updated token wins. Use deterministic ordering when applying a batch.

### 4.3 Sync model

- Players should not update `claimedTokens` or `userLevelState` through broad scene-state snapshots. Use explicit ops so the server can enforce permissions.
- Add client and server support for new op types, for example:
  - `claim.set` - set `claimedTokens[placementId] = userId`.
  - `claim.clear` - remove a claim.
  - `user-level.set` - set one user's active level.
  - `user-level.activate` - GM-only batch write for all known users.
- Mirror these ops in both `state.php` and `board-state-op-applier.js`.
- Include these ops in `boardStateOpDedupKey()`.
- `pusher-service.js` should not need special business logic if it is only forwarding generic ops; the op applier is the important switch.
- `board-state-service.js`, `scene-board-state.js`, and `state.php` must preserve/normalize `claimedTokens` and `userLevelState`; otherwise saves will silently drop the new fields.

### 4.4 Stable level ids

- Current map level ids are opaque ids, not numeric names. Keep surviving ids stable.
- Display labels and `zIndex` may be reindexed after deletion, but token references to surviving levels should not be rewritten just because a visible label changed.
- Only tokens on the deleted level need a new `levelId`.

---

## 5. Feature Specifications

### 5.1 Level 0 / Base Map

**Goal:** The first uploaded map in a scene is a real, addressable level: visible in the level selector, valid as a token `levelId`, and treated identically to levels 1+ except that it cannot be cut out or deleted.

**Behavior:**

- The level selector lists Level 0 at the bottom alongside Level 1, 2, 3...
- Tokens can be moved to Level 0 via the existing token settings controls.
- New tokens placed by a user whose active level is Level 0 are placed on Level 0.
- The cutout editor is disabled/hidden when the GM's current viewing level is Level 0.
- Level 0 cannot be deleted.

**Migration:**

- Existing scenes keep the base map in the current root map URL field.
- Existing stored levels keep their current ids and continue to represent Level 1+.
- Existing tokens lacking `levelId` are treated as Level 0.

### 5.2 Per-User Active Level

**Goal:** Each connected user has their own current level. This controls what they see and where newly placed tokens land.

**Behavior:**

- **GM:** Active level is whichever level the GM is currently viewing via the top-right up/down nav. Moving up/down changes the GM's active level only.
- **Player without a claimed token in this scene:** Defaults to Level 0 on first scene load. Stays there until Activate moves them, they manually change level if such UI is later added, or the GM gives them a token.
- **Player with a claimed token:** Their `userLevelState` follows the token's level whenever that token changes level. On scene load, this restores the last followed/activated level; if state is missing, derive it from the current claimed token level.
- When a claimed token level change updates the player's active level, the player's view pans to the token using the existing player-view focus/ping mechanism.
- If Activate and a PC token level change arrive in the same batch, the claimed-token level wins for that player.

**Persistence:**

- Each user's last active level per scene persists across reloads and logouts.
- Persist the GM's own browsing level too, using the GM's `userLevelState` entry.

**Display:**

- Every user sees a top-right `Level: N` indicator.
- The GM additionally sees up/down nav buttons and the Activate button.

### 5.3 Activate Button (GM only)

**Goal:** Let the GM force every known user to a specific level when needed. It is intentionally distinct from GM browsing.

**Behavior:**

- Sits in the top-right level controls next to the level nav.
- Clicking it sets every known user's active level to the GM's current viewing level. Use known users from the configured chat/player roster, not only currently connected websocket clients, so reloads stay consistent.
- Tokens are not moved.
- Players whose claimed token is on a different level still get pulled by Activate. The next time their claimed token changes level, the follow-token rule takes over again.
- No persistent follow-GM mode.
- Remove the previous selected-level-for-cutout-editing UI. The GM's current viewing level is the level the cutout editor operates on.

### 5.4 Token Claim System

**Goal:** Replace name-only PC/user matching with explicit per-scene claims, so any user can be tied to any token and the level-following logic applies.

**Data model:**

- Per scene: `claimedTokens: { [placementId]: userId }`.
- One claim per token. A new claim by a different user replaces any prior claim.
- A user may claim multiple tokens. Any claimed token level change can drive view-follow; most recently updated wins.

**Defaults:**

- Tokens are unclaimed by default. Treat unclaimed as GM-owned for display and permission purposes.
- PC tokens (Indigo, Sharon, Frunk, Zepha) auto-claim to the matching user the first time they are dragged into a scene.
- Auto-claim should not run on every load and should not replace existing character-sheet linkage. Claim is separate per-scene state.
- Changing scenes resets claims to unclaimed, plus PC auto-claims when those tokens are first placed in that scene.

**Player UI:**

- Prefer adding Claim/Unclaim controls to the existing token settings panel first. A custom right-click menu can come later if desired.
- A player can claim an unclaimed token or transfer a token claimed by another player, unless the GM later adds stricter permissions.
- The UI shows the current claimant for transparency.

**GM UI:**

- The GM can assign a token to any known user or release it back to unclaimed/GM-owned.
- The GM can override existing claims.

**Server permissions:**

- Non-GM users may set a claim only to their own user id.
- Non-GM users may clear their own claim if release is supported. They may not clear or reassign another user's claim except by claiming the token for themselves through `claim.set`.
- GM may set or clear any claim.

**Visual indicator on the map:**

- Claimed player tokens get a colored ring:
  - Indigo: purple
  - Sharon: light grey
  - Frunk: red
  - Zepha: brown-orange
  - GM/unclaimed: no ring
- The ring must not interfere with selection. Selection should draw above the ring, or the ring should fade while selected.

### 5.5 Visibility Rules

**Goal:** Make it instantly clear which level each token is on, while preserving cutout-based reveal.

#### 5.5.1 Same level

- Token renders at 100% size.
- No level arrow.
- Standard interaction behavior.

#### 5.5.2 Tokens below the viewer's active level

- **Player:** Visible only if the cutout path between the viewer level and token level is open by the precise edge rule below.
- **GM:** Always visible regardless of cutouts.
- **Size:** Shrink by 10% per level of distance: 1 below = 90%, 2 = 80%, 3 = 70%, 4 = 60%, 5+ = 50%.
- **Indicator:** Green down-arrow plus the level distance.

#### 5.5.3 Tokens above the viewer's active level

- **Player:** Visible only if the cutout path between the viewer level and token level is open by the same precise edge rule, mirrored upward.
- **GM:** Always visible regardless of cutouts.
- **Size:** 100%. Tokens above are not shrunk.
- **Indicator:** Red up-arrow plus the level distance.

#### 5.5.4 Precise cutout-edge rule

Use one algorithm for looking up and looking down:

1. Convert levels to ordered level indices, where Level 0 is the virtual base and Level 1+ are the stored levels ordered by `zIndex`.
2. Compute the token's occupied grid cells from its footprint.
3. Find every potentially blocking level strictly above the lower of the two levels and up to and including the higher level. Example: viewer Level 2 and token Level 0 checks Level 1 and Level 2 cutouts.
4. Skip a blocking level if that map level is not currently a cross-level blocker, for example hidden, opacity 0, or `blocksLowerLevelVision === false`.
5. For each remaining blocking level, compute its expanded cutout cells: raw cutout cells plus every cell sharing an edge or corner with a raw cutout cell.
6. Intersect the expanded cutout cell sets across all required blocking levels.
7. A token is visible if any of its occupied cells is in the final intersection. If there are no blocking levels after skips, the path is open.

For v2, token cross-level visibility should be binary: once any occupied cell qualifies, render the whole token at its level presentation size. Do not keep the old partial-cell token mask unless that is deliberately chosen during implementation; if kept, verify arrows and claim rings are not clipped away.

Falling uses raw cutout cells only, not expanded edge cells.

#### 5.5.5 Hit area / clickability

- Shrunk tokens must use a hit area scaled to match their visual size.
- The current board hit testing uses rendered placement metadata rather than only DOM bounding boxes, so CSS scale alone is not enough. Store presentation scale/origin on each rendered placement and update:
  - `findRenderedPlacementAtPoint`
  - marquee/selection hit testing
  - drag offset math for scaled rendered tokens
- GM clickability follows GM visibility: GM can click all rendered tokens.
- Player clickability follows player visibility and should not allow interacting with hidden cross-level tokens.

### 5.6 Falling Animation

**Goal:** When a token is moved entirely over a cutout, it visually drops to the next level down with feedback that feels intentional.

**Trigger:**

- After any token movement ends, check whether every occupied cell of the token sits inside the raw cutout area of the token's current level.
- Edge-of-cutout placement does not trigger a fall.
- Level 0 has no cutouts, so falling always stops there.

**Persistence:**

- The final token position and final `levelId` must be persisted as one logical movement/update. Falling cannot be only a local animation.
- Hook this near the token movement commit path so a fall can emit either a `placement.update` patch with `levelId` and coordinates, or a new move op that explicitly supports `levelId`.
- When a claimed token falls, update the claimant's `userLevelState` in the same logical mutation.

**Animation (per token, about 1 second total):**

1. Scale up by 5%.
2. Quick wobble.
3. Scale down from the peak so the token briefly reads as dropping away.
4. Apply/reveal the final level result.

**Who sees the animation:**

- The GM sees it when the token is rendered in the GM view.
- The falling token's claimant sees it.
- Other players may simply receive the end-state render change.

**Chained falls:**

- If the token lands inside another raw cutout on the level below, it keeps falling.
- The animation plays once at the start. Subsequent chained drops snap through to the final resting level.

### 5.7 Level Deletion

**Goal:** Deleting a level should not strand tokens or leave broken references.

**Behavior:**

- Level 0 cannot be deleted.
- Tokens on the deleted level drop to the nearest existing lower level, or Level 0 if there is no lower stored level. No animation.
- Surviving level ids stay stable. Recompute display labels and `zIndex` for levels above the deleted one, but do not rewrite token refs for those surviving levels.
- Claims remain attached to placement ids.
- Any `userLevelState` pointing at the deleted level remaps to the same lower fallback level.
- If the GM is currently viewing the deleted level, remap the GM's active level to that lower fallback.

---

## 6. Data Model Changes

### 6.1 Scene state additions

In `boardState.sceneState[sceneId]`:

```jsonc
{
  "mapLevels": {
    "levels": [],              // existing, stores Level 1+ only
    "activeLevelId": null      // legacy read-only fallback in v2
  },
  "claimedTokens": {
    "<placementId>": "indigo"
  },
  "userLevelState": {
    "indigo": {
      "levelId": "level-0",
      "source": "claim",
      "tokenId": "<placementId>",
      "updatedAt": 1710000000000
    }
  }
}
```

Notes:

- `mapLevels.activeLevelId` becomes obsolete because active level is per user. Keep it readable for migration but stop writing it after v2 lands.
- Use `"level-0"` as the canonical base level id in helpers and user level state.
- Placements with missing/null/blank `levelId` still resolve to Level 0.
- Scene-state save paths must preserve the two new top-level scene fields.

### 6.2 Token placement

- Reuse `placement.levelId`.
- Missing/null/blank means Level 0 for legacy data.
- New explicit writes to Level 0 may use `"level-0"`.

### 6.3 Ops and server endpoints

Prefer extending the existing op-style state endpoint over adding isolated endpoints.

Required operations:

- `claim.set`
- `claim.clear`
- `user-level.set`
- `user-level.activate`

Server rules:

- Validate `placementId` exists before claim ops.
- Validate target `levelId` exists or is `"level-0"`.
- Non-GM can write only their own `userLevelState`.
- Non-GM can claim only for themselves.
- GM can update any claim or user level.

---

## 7. Implementation Map (file-by-file)

This is a starting point. Actual edits may touch more files than listed.

### 7.1 Data model and normalization

- `dnd/vtt/assets/js/state/normalize/map-levels.js`
  - Add/export `BASE_MAP_LEVEL_ID`.
  - Keep stored normalization focused on Level 1+.
  - Add or support a view-model helper that receives the base map URL and returns `[Level 0, Level 1, ...]` for UI/render decisions.
  - Keep `activeLevelId` readable only as legacy fallback.
- `dnd/vtt/assets/js/state/normalize/placements.js`
  - Normalize placement level ids so missing/null/blank resolves to Level 0 in helpers.
- `dnd/vtt/assets/js/state/normalize/scene-board-state.js`
  - Normalize and preserve `claimedTokens` and `userLevelState`.
- `dnd/vtt/assets/js/services/board-state-service.js`
  - Include the new scene fields in payload building.
  - Add dedupe keys for the new op types.
- `dnd/vtt/assets/js/state/board-state-op-applier.js`
  - Apply claim and user-level ops locally.
- `dnd/vtt/api/state.php`
  - Normalize/persist new fields.
  - Validate and apply the new op types with the permission rules above.

### 7.2 Rendering

- `dnd/vtt/assets/js/ui/map-level-renderer.js`
  - Drive active-level datasets from the current user's active level, not scene-global `mapLevels.activeLevelId`.
  - Continue rendering Level 1+ overlay maps. Treat the existing base map image as visual Level 0 unless the base image is intentionally refactored out.
- `dnd/vtt/assets/js/ui/token-levels.js`
  - Split placement-level resolution from active-level resolution.
  - Implement the edge-rule intersection algorithm.
  - Implement presentation metadata: distance, direction, scale, indicator, and claim ring.
  - Add focused tests for Level 0, missing `levelId`, above/below visibility, multi-level edge intersections, scale, and indicators.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Render tokens using the per-user active level.
  - Store scale/origin in `renderedPlacements`.
  - Update token hit testing for scaled tokens.

### 7.3 UI controls

- `dnd/vtt/components/SceneBoard.php` and related CSS
  - Add a player-visible top-right level indicator.
  - Keep nav buttons and Activate GM-only.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Wire GM up/down browsing to GM-only `userLevelState`.
  - Wire Activate to `user-level.activate`.
  - Remove/disable selected-level cutout controls; cutout editing follows the GM active level.
  - Add claim controls to the existing token settings panel before building a new custom context menu.
  - Reuse existing focus/ping mechanics for claimed-token view-follow.
- `dnd/vtt/assets/js/ui/token-interactions.js`
  - Auto-claim PC tokens on first drag into a scene.
  - Hook movement commit to falling checks and final level persistence.
- `dnd/vtt/assets/js/ui/scene-manager.js`
  - Implement deletion remap with stable surviving ids.

### 7.4 Falling animation

- New module, for example `dnd/vtt/assets/js/ui/token-fall-animation.js`
  - CSS/keyframe based.
  - Plays once per fall chain.
  - Resolves before the final level presentation is revealed for the claimant/GM.

---

## 8. Tests and Verification

Add or update tests around the behavior most likely to regress:

- Map level normalization:
  - Level 0 is virtual and not persisted in `mapLevels.levels`.
  - Stored Level 1+ ids remain stable.
- Placement level resolution:
  - Missing/null/blank `levelId` resolves to Level 0.
  - Active level fallback is not used as token placement fallback.
- Visibility:
  - Same-level full visibility.
  - Token below with one blocking cutout.
  - Token above with mirrored cutout logic.
  - Multi-level intersection succeeds/fails deterministically.
  - Hidden/non-blocking/transparent levels are skipped as blockers.
- Presentation:
  - Below-level scaling clamps at 50%.
  - Above-level tokens stay 100%.
  - Indicators show correct direction/distance.
  - Hit testing follows scaled size.
- Sync:
  - Claim ops apply client/server side.
  - Non-GM cannot write another user's active level.
  - Activate writes all known users.
  - Scene payload saves preserve `claimedTokens` and `userLevelState`.
- Deletion:
  - Tokens on deleted level remap down.
  - Surviving level ids remain unchanged.
  - User active states pointing at deleted level remap down.
- Falling:
  - Raw cutout trigger only.
  - Edge-buffer cells do not trigger falling.
  - Chained fall resolves to final level with one animation.

---

## 9. Non-Goals / Out of Scope

- Persistent follow-GM mode for players.
- Polygon cutouts.
- Per-user fog of war.
- Cross-scene claim persistence.
- Animation broadcast guarantees for non-claimant players.

---

## 10. Implementation Checks

These are not open design questions, but they deserve attention during build:

1. **Claim UI location:** Start with the existing token settings panel. It already exists and avoids introducing a custom context-menu system just for claims.
2. **Auto-claim race conditions:** Server validation plus last-writer-wins is acceptable.
3. **Mid-fall claim changes:** The new claimant receives the final state. They do not need to see an animation already in progress.
4. **GM browsing while another token falls:** GM sees the animation only if the token is rendered in their current view. The persisted level change still applies even if no animation is visible.
5. **Manual browser verification:** After UI work, hard refresh and verify the version/footer behavior described in repo instructions.

---

## 11. Build Order (suggested)

1. **Constants, normalization, and ops:** Add Level 0 sentinel, virtual level view helpers, `claimedTokens`, `userLevelState`, server/client op support, and scene payload preservation.
2. **Per-user active level:** Resolve active level per user, add the level indicator, and make GM browsing write only GM state.
3. **Level 0 token placement:** Ensure existing tokens resolve to Level 0, new tokens land on the user's active level, and token settings can move tokens to/from Level 0.
4. **Activate:** Add the GM button and `user-level.activate` flow.
5. **Visibility and presentation:** Add above/below rules, edge intersections, scaling, arrows, and scaled hit testing.
6. **Claims:** Add claim UI, PC auto-claim, rings, and claim-driven active-level updates.
7. **View-follow:** Pan users to claimed tokens when those tokens change level.
8. **Falling:** Add raw-cutout detection, final level persistence, animation, chained fall handling, and claimant state updates.
9. **Deletion cascade:** Delete stored levels safely, remap tokens/user states, and keep surviving ids stable.

Each step should be independently testable. Steps 1-4 deliver Level 0, per-user active level, and Activate before the heavier claim/visibility/falling behavior lands.

---

## 12. Implementation Progress

### Step 1 — Constants, normalization, and ops (DONE)

Landed on branch `claude/focused-kapitsa-10aff9` (worktree `focused-kapitsa-10aff9`). All 408 existing JS tests still pass; 26 new tests cover the additions. PHP changes are unit-tested by the existing op/state suite (no PHP test runner was available locally to run; rely on the ops broadcast plus the integration path for follow-up verification).

Files touched:

- `dnd/vtt/assets/js/state/normalize/map-levels.js`
  - Added `BASE_MAP_LEVEL_ID = 'level-0'` constant.
  - Added `resolvePlacementLevelId(placement)` so missing/null/blank `levelId` resolves to Level 0 without using the user's active level as a fallback.
  - Added `buildLevelViewModel({ baseMapUrl, mapLevels, sceneGrid })` that returns Level 0 (virtual, derived from the scene base map URL) followed by stored Level 1+ levels sorted by `zIndex`. Stored levels are not persisted as Level 0; the base map remains the visual Level 0 image.
  - Added `levelIdExistsInViewModel(levelId, viewModel)` for validators.
  - Added `normalizeUserLevelStateEntry`, `normalizeUserLevelStateMap`, and `normalizeClaimedTokensMap` for the per-scene v2 fields. Profile id keys are normalized to lowercase; unknown sources fall back to `manual`.
- `dnd/vtt/assets/js/state/normalize/scene-board-state.js`
  - Per-scene normalizer now preserves `claimedTokens` and `userLevelState` so reads do not silently drop the fields.
- `dnd/vtt/assets/js/services/board-state-service.js`
  - Snapshot save payload builder now serializes `claimedTokens` and `userLevelState` for each scene.
  - `boardStateOpDedupKey()` recognizes `claim.set`, `claim.clear`, `user-level.set`, and `user-level.activate` so rapid repeats coalesce in the pending ops buffer.
- `dnd/vtt/assets/js/services/board-state-op-applier.js`
  - Added handlers for `claim.set`, `claim.clear`, `user-level.set`, `user-level.activate`. They mutate `boardState.sceneState[sceneId]` in place, creating the entry if missing, and follow the source/tokenId/updatedAt schema from §4.2. Permission rules live on the server.
- `dnd/vtt/api/state.php`
  - `applyBoardStateOp()` accepts the four new op types. Permissions: non-GM may only claim a token for themselves and may only clear their own claim; non-GM may only write their own `userLevelState`; `user-level.activate` is GM-only. `claim.set` validates that the placement exists; both `user-level.*` ops validate the target level id (allowing the `level-0` sentinel).
  - The op call site forwards the caller's normalized profile id (`strtolower(trim($auth['user']))`) into `$opContext['userId']`.
  - `normalizeSceneStatePayload()` preserves `claimedTokens` and `userLevelState` via two new helpers so snapshot saves do not drop the fields.
  - Added `ensureBoardStateSceneEntry`, `boardStatePlacementExists`, and `boardStateLevelIdIsValid` helpers used by the new op handlers.

Tests added:

- `dnd/vtt/assets/js/state/__tests__/map-levels-v2-normalization.test.mjs` — `BASE_MAP_LEVEL_ID`, placement level resolution, view-model construction/sorting, user-level/claim normalization, scene-state preservation.
- `dnd/vtt/assets/js/services/__tests__/board-state-op-applier-levels-v2.test.mjs` — claim.set/clear semantics (replace, no-op, malformed), user-level.set with sources/tokenId, user-level.activate batch behavior including auto-creation of missing scene state.

Notes for follow-up steps:

- The legacy `mapLevels.activeLevelId` is still read but should stop being written once Step 2 (per-user active level) lands.
- `state.php`'s broadcast path forwards ops generically via `'ops' => $ops`, so new ops need no extra special-casing in `pusher-service.js` — the client-side op applier is the routing point.
- Step 2 will need to expose the caller's normalized profile id to the client (e.g. via the bootstrap config) so `user-level.set` can target the correct user; today the client derives this from `state.user.name` lowercased (see `getCurrentUserId()` in `board-interactions.js`), which matches the server's normalization.

### Step 2 — Per-user active level (DONE)

Landed on branch `claude/adoring-ramanujan-bc9e65` (worktree `adoring-ramanujan-bc9e65`). All previously-passing JS tests still pass; 11 new tests cover the additions (419 total, up from 408 at end of Step 1).

Files touched:

- `dnd/vtt/assets/js/state/normalize/map-levels.js`
  - Added `resolveActiveLevelIdForUser({ sceneState, userId, placements, validLevelIds })`. Implements §4.2's priority chain: validated `userLevelState[userId].levelId` → most-recently-modified claimed token's level (using `placement._lastModified`) → `BASE_MAP_LEVEL_ID`. `validLevelIds` is optional; when supplied it filters out stored ids that no longer exist in the scene's view model so a stale entry falls through to the next rule. The helper does not consult `mapLevels.activeLevelId`, which keeps it correct even after Step 5 strips the legacy reads.
- `dnd/vtt/assets/js/ui/token-levels.js`
  - `getMapLevelNavigationControlState(mapLevelsState, { currentLevelId })` now accepts an explicit `currentLevelId`. The override is honored only when it matches a stored Level 1+ id; unknown ids (including `level-0`, which is virtual) fall back to the prior `resolveTokenLevelId({}, mapLevels)` behavior. This keeps the GM nav usable during the transition window when the GM's `userLevelState` resolves to Level 0 but stored levels do not yet expose it.
- `dnd/vtt/assets/js/ui/map-level-renderer.js`
  - `sync(rawMapLevels, { activeLevelId })` accepts an explicit override that drives `dataset.activeMapLevelId`. `undefined` keeps the prior fallback to `mapLevels.activeLevelId`; an empty string clears. Callers can pass `level-0` even though it is not in `mapLevels.levels` — the renderer just records it for downstream code, since it does not draw a Level 0 overlay.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Added `getViewerLevelIdForCurrentUser(state, sceneId)`: looks up the per-user resolved level by combining the per-scene `sceneState`, `claimedTokens`, and `placements` and gates on a `validLevelIds` set built from `[BASE_MAP_LEVEL_ID, ...storedLevels]`.
  - Added `getViewerLevelDisplayName(state, sceneId, levelId)`: returns "Level 0" for `BASE_MAP_LEVEL_ID` and otherwise looks up the stored level entry's display label/name via `buildLevelViewModel`. Used by the new indicator only.
  - `syncMapLevelsForState` now resolves the per-user level once and passes it to the renderer (`activeLevelId` override), the GM nav controls (`currentLevelId` override), and the new player-visible indicator (`syncMapLevelIndicator`).
  - `handleMapLevelNavigationClick` rewritten:
    - Reads the GM's current viewer level from `userLevelState[gmId]` instead of `mapLevels.activeLevelId`.
    - Computes the adjacent target level via `getAdjacentTokenLevel`.
    - Mutates only `sceneEntry.userLevelState[gmId] = { levelId, source: 'manual', updatedAt }`. The legacy `mapLevels.activeLevelId` is no longer written from this path (per §4.2 / the Step 1 follow-up note).
    - Broadcasts a single `user-level.set` op via `persistBoardStateSnapshot({}, [op])`. The local state was already mutated in the `boardApi.updateState` block above, so the op applier's mirror-mutation is a no-op for the originating client; the op goes through Pusher to remote clients.
  - `resolveEditableMapLevel` and `syncMapLevelCutoutButtons` now follow the GM's per-user viewer level, with a fallback to the legacy `activeLevelId` while the GM is still on `BASE_MAP_LEVEL_ID` so existing scenes keep their cutout-edit affordance until Step 3 adds Level 0 to the nav and §5.1 disables cutouts on Level 0 explicitly.
  - DOM lookups for the new `[data-map-level-indicator]` element added near the existing `mapLevelNav` lookup.
- `dnd/vtt/components/SceneBoard.php`
  - Adds the player-visible top-right indicator (`<p data-map-level-indicator>...`) above the GM-only level nav. Hidden by default; the JS toggles `hidden`/`aria-hidden` based on whether a scene is active and a level resolves.
- `dnd/vtt/assets/css/board.css`
  - Adds `.vtt-board__level-indicator`, `.vtt-board__level-indicator-label`, and `.vtt-board__level-indicator-value` styles modeled on the existing level-nav chrome so the indicator is visually consistent across users.

Tests added:

- `dnd/vtt/assets/js/state/__tests__/map-levels-v2-normalization.test.mjs` — six new cases for `resolveActiveLevelIdForUser`: missing scene state, missing user entry, lowercased userId match, `validLevelIds` rejecting unknown stored ids, claim-based fallback (most recent `_lastModified`), userLevelState priority over claims, and other-user-claim isolation.
- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` — `getMapLevelNavigationControlState` honors `currentLevelId` and ignores unknown overrides.
- `dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` — `sync` honors an explicit `activeLevelId` override (including `level-0`) and falls back to `mapLevels.activeLevelId` when none is supplied.

Behavioral consequences for downstream steps:

- Players' visibility code (`getPlayerTokenMapLevelVisibility`, `resolvePlayerActiveMapLevelId`) still reads the legacy `mapLevels.activeLevelId`. After Step 2, that value is frozen at whatever it was last persisted to (existing scenes); GM nav no longer mutates it. Until Step 5 ports the visibility logic to per-user `userLevelState`, this means: (a) players' visibility no longer follows GM browsing — intentional per §5.2, and (b) players cannot move themselves between levels yet. Step 4 (Activate) and Steps 6/7 (claims, view-follow) will provide the explicit mechanisms.
- The cutout editor (`resolveEditableMapLevel`, `syncMapLevelCutoutButtons`) reads the GM's per-user viewer level when it is a stored Level 1+ id, otherwise falls back to the legacy id. Once Step 3 makes Level 0 a navigable level the legacy fallback should be removed and the editor disabled on Level 0 per §5.1.
- The `user-level.set` op uses the existing op-broadcast path. The op applier (Step 1) already mirrors the client-side mutation; the server (`state.php`) enforces the GM-only / self-only rules from §6.3.

### Step 3 — Level 0 token placement (DONE)

Landed on branch `claude/magical-bohr-3bfb6f` (worktree `magical-bohr-3bfb6f`). All previously-passing JS tests still pass; 3 new tests cover the additions (422 total, up from 419 at end of Step 2).

Files touched:

- `dnd/vtt/assets/js/ui/token-levels.js`
  - Added imports for `BASE_MAP_LEVEL_ID` and `resolvePlacementLevelId` from `state/normalize/map-levels.js`.
  - Added `buildVirtualBaseLevelEntry()` (private) that synthesizes the Level 0 entry shape used by the navigation/control helpers. The synthetic entry uses `zIndex: -Infinity`, `isBaseLevel: true`, no `mapUrl`, and `blocks*` flags set to `false` so it cannot be mistaken for a stored level. It is intentionally minimal: nav helpers only read `id` and `name`, so the entry does not need to mirror `buildLevelViewModel`'s richer shape.
  - Added `getOrderedTokenMapLevelsWithBase(rawLevels, options)` (private) that wraps `getOrderedTokenMapLevels` and prepends the synthetic Level 0 when `options.includeBaseLevel` is truthy. The helper exists so the three exported functions share the same prepend logic without each implementing it.
  - `getAdjacentTokenLevel(mapLevelsState, currentLevelId, direction, options)` now accepts `options.includeBaseLevel`. When true, the candidate-levels list is `[Level 0, ...stored Level 1+]` and the helper resolves the override id against that combined list (including `level-0`). When the override is unknown it falls through to `resolveTokenLevelId({}, mapLevelsState)` for backward compatibility.
  - `getTokenLevelControlState(mapLevelsState, placement, options)` now accepts `options.includeBaseLevel`. When true, it (a) prepends Level 0 to the control's `levels` array and (b) resolves the placement's current level via `resolvePlacementLevelId(placement)` instead of the legacy `resolveTokenLevelId(placement, mapLevelsState)` so a placement with `levelId === BASE_MAP_LEVEL_ID` (or missing/blank) is recognized as Level 0. Without `includeBaseLevel` the legacy resolver is preserved.
  - `getMapLevelNavigationControlState(mapLevelsState, options)` now accepts `options.includeBaseLevel`. The override-id check passes once Level 0 is in the candidate list, so the GM nav can land on `level-0`.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Added `resolvePlacementLevelId` to the existing `state/normalize/map-levels.js` import.
  - `getActiveTokenPlacementLevelId(state)` rewritten: instead of `resolveTokenLevelId({}, mapLevels)` (which returned the legacy `mapLevels.activeLevelId` or the first stored level), it now returns `getViewerLevelIdForCurrentUser(state, activeSceneId)`. New tokens dropped while the user views Level 0 receive `placement.levelId = "level-0"` (per §5.1). New tokens dropped while a user views a stored level receive that stored id. When no scene is active the helper returns `null` so the existing token-drop guard (`if (levelId) placement.levelId = levelId`) leaves the placement untouched, matching the pre-v2 fallback.
  - `syncMapLevelsForState` passes `{ currentLevelId, includeBaseLevel: true }` to `syncMapLevelNavigationControls` so the GM nav reflects Level 0 as a navigable destination.
  - `handleMapLevelNavigationClick` rewritten to pass `{ includeBaseLevel: true }` to both `getMapLevelNavigationControlState` and `getAdjacentTokenLevel`. The GM up/down nav now steps into and out of `level-0` and writes `userLevelState[gmId].levelId = "level-0"` when the GM browses to the base map. The retry/early-return paths also pass `includeBaseLevel: true` for consistency.
  - `handleTokenLevelMoveClick` now resolves the placement's current level via `resolvePlacementLevelId(placement)` (so `level-0`/missing/blank is recognized) and passes `{ includeBaseLevel: true }` to `getAdjacentTokenLevel`. Token-settings up/down can move tokens between Level 0 and the stored Level 1+, satisfying §5.1.
  - `syncTokenLevelControls` passes `{ includeBaseLevel: true }` to `getTokenLevelControlState` so the token-settings level chrome (current level name, up/down disabled state) reflects Level 0.
  - `resolveEditableMapLevel` legacy fallback removed: when `getViewerLevelIdForCurrentUser` returns `BASE_MAP_LEVEL_ID` (the GM is viewing Level 0) the helper returns `null`, which keeps the cutout editor disabled per §5.1. The Step 2 fallback to `mapLevels.activeLevelId` is gone; existing scenes whose persisted active id was a stored level no longer surface the cutout editor on first load — the GM has to nav up to that level once, which is the intended v2 behavior.
  - `syncMapLevelCutoutButtons` no longer falls back to the legacy `mapLevels.activeLevelId` when the GM views Level 0. The "active level for cutout editing" is `''` in that case so no per-level cutout button is marked as the editor's current target; the buttons remain disabled via the existing `isActiveLevel`/`hasMap` guards.
  - The `getActiveMapLevelId(rawMapLevels, sceneGrid)` local helper was removed because its only caller (the legacy `syncMapLevelCutoutButtons` fallback) was deleted in this step. No exports referenced it.
- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs`
  - Three new tests (added inside the existing `token level helpers` suite):
    - `navigation control state includes the virtual Level 0 when requested` — verifies `getMapLevelNavigationControlState` with `includeBaseLevel: true` lists `[level-0, ...stored]`, treats `level-0` as the current level when the override matches, and reports `canMoveDown: false` / `canMoveUp: true` from Level 0.
    - `adjacent token level steps into and out of Level 0 when included` — verifies `getAdjacentTokenLevel(..., 'down', { includeBaseLevel: true })` returns the synthetic Level 0 from a stored Level 1+, the reverse direction returns the next stored level, and Level 0 has no further "down" target.
    - `token level controls expose Level 0 as a valid target` — verifies `getTokenLevelControlState(..., { includeBaseLevel: true })` resolves a legacy placement (no `levelId`) and an explicit `levelId: 'level-0'` placement to the synthetic Level 0 entry, and that placements on stored levels still report Level 0 as the down target.

Behavioral consequences for downstream steps:

- New tokens placed by the GM while viewing Level 0 carry `placement.levelId = "level-0"`. The legacy `resolveTokenLevelId(placement, mapLevels)` (used by `renderTokens`, `getPlayerTokenMapLevelVisibility`, etc.) does not currently recognize `level-0` as a valid id — its `levelIds` set is built from `mapLevels.levels` (Level 1+ only), so a `level-0` placement falls through to the legacy `mapLevels.activeLevelId` fallback or the first stored level. For the GM this is cosmetic — the GM always sees every token regardless. For players, a `level-0` placement is currently rendered as if it were on the legacy active level. Step 5 fixes this when it ports rendering/visibility to `resolvePlacementLevelId`.
- A scene with no stored Level 1+ levels still has a Level 0 entry in the GM nav now (because `includeBaseLevel: true` always synthesizes one). The nav's up/down controls are disabled in that case (`canMoveUp` and `canMoveDown` are both false) but the indicator still shows "Level 0". This intentionally exposes the v2 model even on minimal scenes.
- The cutout editor is now disabled whenever the GM's resolved viewer level is `BASE_MAP_LEVEL_ID`. For existing scenes that loaded before any v2 GM browsing has occurred, `getViewerLevelIdForCurrentUser` returns `BASE_MAP_LEVEL_ID` (no `userLevelState[gmId]` entry, no claims), so the editor stays inactive until the GM clicks the up nav once. This is the intended §5.1 behavior, but is a one-time UX change for GMs who reopen old scenes.
- Level 0 deletion is impossible by construction: `mapLevels.levels` does not contain a Level 0 entry, so the existing `delete-map-level` action's `mapLevels.levels.filter(level => level.id !== levelId)` is a no-op when invoked with `level-0`, and the scene-list UI does not render a delete button for Level 0 (Level 0 is not in `mapLevels.levels`). No defensive guard was added in scene-manager.js since there is no surface that could trigger it.

### Step 4 — Activate (DONE)

Landed on branch `claude/vibrant-chandrasekhar-b7f6db` (worktree `vibrant-chandrasekhar-b7f6db`). All previously-passing JS tests still pass; 3 new tests cover the additions (425 total, up from 422 at end of Step 3).

Files touched:

- `dnd/vtt/assets/js/state/normalize/map-levels.js`
  - Added `KNOWN_LEVEL_USER_IDS = Object.freeze(['gm', 'frunk', 'sharon', 'indigo', 'zepha'])`. This mirrors the password→user map in `dnd/index.php` normalized to lowercase profile ids. It is the configured chat/player roster called for in §5.3 ("known users from the configured chat/player roster, not only currently connected websocket clients"). The list is frozen so callers cannot mutate the shared roster, and exported so the activate handler and its tests share one source of truth.
- `dnd/vtt/components/SceneBoard.php`
  - Added a GM-only `<button data-action="activate-map-level">Activate</button>` inside the existing `[data-map-level-nav]` block, after the up-level button. It inherits the nav's `hidden`/`aria-hidden` toggling, so it is hidden whenever the nav is hidden (no scene active or non-GM). The PHP guard (`if ($isGm)`) means non-GM markup never includes the button.
- `dnd/vtt/assets/css/board.css`
  - Added `.vtt-board__level-activate` rules modeled on the existing `.vtt-board__level-button` chrome (matching height, border, background, hover/disabled/focus styles) but with horizontal padding and uppercase text so the Activate label reads as a labeled action rather than a directional glyph.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Imported `KNOWN_LEVEL_USER_IDS` from `state/normalize/map-levels.js`.
  - Added a `mapLevelActivateButton` DOM lookup next to the existing `mapLevelNavDown`/`mapLevelNavUp` lookups.
  - Added `handleMapLevelActivateClick()`:
    - Guards on `isGmUser()` (the server enforces GM-only via `state.php`'s permission check, but skipping the network call when a non-GM somehow sees the button keeps the UI consistent).
    - Resolves the GM's current viewer level via `getViewerLevelIdForCurrentUser(state, activeSceneId)` (Step 2's helper). Bails when no scene is active or no level resolves.
    - Mutates the scene draft directly (`sceneEntry.userLevelState[userId] = { levelId, source: 'activate', updatedAt }` for every entry in `KNOWN_LEVEL_USER_IDS`). Marks the scene state dirty so the snapshot save preserves the rows.
    - Broadcasts a single `user-level.activate` op via `persistBoardStateSnapshot({}, [activateOp])` carrying the full `userIds` list. The op applier mirror-writes are no-ops on the originating client (the `updateState` block above already wrote them), but remote clients pick them up via Pusher.
    - Resyncs the level UI (`syncMapLevelsForState`) and writes a status message ("Pulled all players to <Level Name>.").
  - Wired the click listener next to the existing nav listeners: `mapLevelActivateButton?.addEventListener('click', ...)`.

Tests added:

- `dnd/vtt/assets/js/state/__tests__/map-levels-v2-normalization.test.mjs` — two tests under a new `KNOWN_LEVEL_USER_IDS roster` suite verifying the exact ordered roster (`['gm', 'frunk', 'sharon', 'indigo', 'zepha']`) and that the array is frozen.
- `dnd/vtt/assets/js/services/__tests__/board-state-op-applier-levels-v2.test.mjs` — one test under the existing `user-level.activate` suite that imports `KNOWN_LEVEL_USER_IDS`, seeds a scene with a pre-existing claim-driven entry for `indigo` (with `tokenId`), applies an activate op carrying the full roster, and asserts every roster member ends up on the target level with `source: 'activate'` and that the previous `tokenId` is dropped (activate writes a fresh entry without `tokenId` so the follow-token rule re-engages cleanly on the next claimed-token level change).

Behavioral consequences for downstream steps:

- Activate's mutation shape on the originating client uses `boardApi.updateState` directly (mirroring `handleMapLevelNavigationClick`'s pattern from Step 2), then broadcasts an op. The op applier's local mirror is idempotent for a state already mutated this way, so remote clients converge on the same per-user entries.
- The roster list is canonical for v2; if the campaign adds or removes a chat user the entry must be updated in `KNOWN_LEVEL_USER_IDS` (and in `dnd/index.php`). No discovery-from-state path is implemented because the plan explicitly calls for a configured roster, not a derived one.
- Activate intentionally omits `tokenId` on the per-user entries it writes. The test locks this in. Step 6/7 (claims and view-follow) should treat a user-level entry with `source: 'activate'` and no `tokenId` as "not currently following a token", and the next time a claimed token level change touches that user, the new `claim`-source entry takes over.
- The Activate button's enabled state currently matches the nav's visibility (GM + scene active). It is not separately disabled when the GM is on Level 0 — by design, since pulling everyone to Level 0 is a valid and useful Activate action (e.g. clearing the table). The button label and tooltip ("Pull all players to this level") cover that.
- `mapLevels.activeLevelId` is still untouched by the Activate path (continuing the Step 2 freeze on writes to the legacy field). Existing snapshots that load with a stale `activeLevelId` still ignore it during per-user level resolution.

### Step 5 — Visibility and presentation (DONE)

Landed on branch `claude/suspicious-feistel-5ac3d2` (worktree `suspicious-feistel-5ac3d2`). All previously-passing JS tests still pass; 12 new tests cover the additions (437 total, up from 425 at end of Step 4).

Files touched:

- `dnd/vtt/assets/js/ui/token-levels.js`
  - Added `getMapLevelDistanceScale(direction, distance)` exported helper that returns the §5.5.2 scale curve: `same`/`above` → 1.0, `below` → max(0.5, 1 − 0.1 × distance). Used by both the presentation helper and any caller that wants to project the same scale (drag preview, hit testing) without re-running the full presentation pipeline.
  - Added private helpers `getOrderedLevelsWithBase(rawLevels)` (returns `[Level 0, ...stored]`) and `buildExpandedCutoutCellSet(level)` (returns a `Set` of `${col},${row}` keys covering the raw cutout cells plus their 8-neighborhood per §5.5.4 step 5).
  - Added `getTokenLevelPresentation(placement, mapLevelsState, options)` — the v2 source of truth for cross-level visibility and rendering metadata. Implements §5.5.4 verbatim:
    1. Builds `[Level 0, ...stored]`.
    2. Resolves `placement.levelId` via `resolvePlacementLevelId` (legacy missing/null → Level 0).
    3. Resolves the viewer level from `options.viewerLevelId`, falling back to Level 0 when missing or unknown.
    4. Returns `{visible, fullyVisible, hasLevels, sameLevel, direction, distance, scale, indicator, levelId, activeLevelId, levelIndex, activeLevelIndex, bounds, visibleCells}` where `direction ∈ 'same'|'above'|'below'`, `scale` follows the §5.5.2 curve, and `indicator` is `null` for same-level or hidden tokens and `{direction, distance}` otherwise.
    5. GM bypass: when `options.gmViewing` is true, every token is visible and the function still returns the correct `direction`/`distance`/`scale`/`indicator` so the GM gets the level badges and the shrink for below-level tokens (§5.5).
    6. Player path: gathers blocking levels strictly above the lower of viewer/placement up to and including the higher (§5.5.4 step 3), skips levels that are hidden / opacity 0 / `blocksLowerLevelVision === false` / mapless (§5.5.4 step 4), pre-computes their expanded cutout sets, and the token is visible iff every blocking level's expanded set covers at least one occupied cell (binary per the §5.5.4 final paragraph). When there are no remaining blocking levels the path is open.
  - `visibleCells` is intentionally always `null` for cross-level results in v2. Same-level tokens return `null` too — the caller can treat `fullyVisible` as canonical and skip the legacy partial-cell mask path.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Imported `getTokenLevelPresentation`.
  - `renderTokens` now resolves the per-user viewer level once via `getViewerLevelIdForCurrentUser(state, sceneId)` (Step 2 helper) and calls `getTokenLevelPresentation` per placement with `gmViewing` and `viewerLevelId`. Tokens whose `presentation.visible` is false are skipped; the GM still gets every token because `gmViewing: true` short-circuits the edge rule.
  - The rendered placement record (`renderedPlacements`) now stores `scale`, `scaleOriginX`, `scaleOriginY`, `levelDirection`, `levelDistance`, and `sameLevel` so downstream consumers (hit testing, marquee, drag) can reproduce the rendered geometry without recomputing the presentation. `visibleCells` is now explicitly `null` because v2 does not use partial-cell masks (§5.5.4 final paragraph).
  - The token DOM transform is built via the new `buildTokenLevelTransform(left, top, scale)` helper, which appends ` scale(<n>)` to the existing `translate3d(...)` only when scale ≠ 1. `transform-origin: 50% 50%` is set so the token shrinks around its grid-cell center; this matches the hit-test geometry below.
  - The legacy `applyTokenMapLevelVisibilityMask(token, visibility, ...)` call site is replaced by `clearTokenMapLevelVisibilityMask(token)` (idempotent) followed by the new `applyTokenLevelPresentation(token, presentation)`. The mask helpers themselves are left in place but are no longer reached during rendering; they can be removed in a follow-up.
  - Added `applyTokenLevelPresentation(token, presentation)` that appends a child `.vtt-token__level-indicator` element (with arrow span + distance span) for above/below tokens and removes it for same-level. The arrow uses the Unicode glyphs ▲ (above) / ▼ (below); the colors come from CSS via `[data-direction='above'|'below']`.
  - `findRenderedPlacementAtPoint(event)` now scales the placement's hit box around the cell center using the stored `scale`. A point inside the unscaled grid cell but outside the shrunk visual no longer counts as a hit (§5.5.5). Player interaction gating now calls `getTokenLevelPresentation` with `mode: 'interaction'` and the resolved `viewerLevelId`, replacing the legacy `isPlacementInteractableOnPlayerMapLevel` for this code path.
  - `isTokenElementVisibleToPlayer` and `renderAuras` migrated to `getTokenLevelPresentation`. The token-settings open-permission check (`canOpen`) similarly uses the new helper for both vision and interaction paths.
- `dnd/vtt/assets/js/ui/token-interactions.js`
  - `getTokensInSelectionBox` now scales the matching rectangle around the cell center via `placement.scale` so the marquee only catches a shrunk below-level token when the box overlaps its visible footprint (§5.5.5).
  - The drag preview pipeline (`beginTokenDrag` → `dragElements` cache → `updateTokenDrag` translate-only update) now records each rendered placement's `scale` and re-applies it inside the drag transform string so a below-level token stays shrunk while it follows the pointer. Without this the drag would visually snap the token back to 100%.
- `dnd/vtt/assets/css/board.css`
  - Set `.vtt-token { transform-origin: 50% 50%; }` so the per-level scale shrinks around the cell center, matching the hit-test math.
  - Added `.vtt-token__level-indicator`, `.vtt-token__level-indicator-arrow`, and `.vtt-token__level-indicator-distance` rules. The badge sits in the top-right of the token, uses tabular-numerals for the distance, and switches color via `[data-direction='above']` (red palette) / `[data-direction='below']` (green palette). The indicator inherits the token's transform so it scales with below-level tokens — that matches the readability spec where distant-below tokens are smaller, including their badge.

Tests added (all in `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs`, new `Levels v2 token presentation` suite):

- `getMapLevelDistanceScale returns the correct scale for direction/distance` — locks in the §5.5.2 curve, including the 50% floor at distance 5+ and that above-level always returns 1.
- `same-level placement returns full visibility, no indicator, scale 1` — sanity check for the same-level branch.
- `GM bypass: above and below tokens are always visible regardless of cutouts` — verifies §5.5.2/§5.5.3 GM rules and that GM still gets `direction`/`distance`/`scale`/`indicator` populated.
- `player below-level: edge rule reveals tokens whose cells are within one square of a cutout` — covers the §5.5.4 step 5 expanded cutout (raw + 8-neighborhood) with both edge-adjacent and corner-adjacent cells, plus a far-away negative case.
- `player above-level visibility uses the same edge rule mirrored upward` — verifies the rule is symmetric for `direction === 'above'`.
- `multi-level edge intersection requires every blocking level to overlap` — viewer Level 2, token Level 0, two blocking levels, demonstrates that a cell must be in every expanded cutout, not just one.
- `non-blocking levels (hidden, opacity 0, blocksLowerLevelVision=false) are skipped` — confirms §5.5.4 step 4: when the only candidate blocker is non-blocking, the path becomes open.
- `placement on Level 0 (legacy missing levelId) is recognized as the base level` — covers the §5.1 migration path: a placement with no `levelId` resolves to `level-0` in the v2 helper.
- `viewer falls back to Level 0 when viewerLevelId is missing or unknown` — confirms the safe default.
- `multi-cell placement is binary: any visible cell shows the whole token` — locks in the §5.5.4 final paragraph's binary rule and confirms `visibleCells` is `null` (no partial mask) in v2.
- `interaction mode uses interaction blockers separately from vision` — verifies that `mode: 'interaction'` follows `blocksLowerLevelInteraction` independently of `blocksLowerLevelVision`.
- `placement referencing a deleted level reports not visible` — defensive check for orphaned `levelId` strings.

Behavioral consequences for downstream steps:

- Cross-level visibility for players is now binary at the token level. The legacy partial-cell mask code path (`applyTokenMapLevelVisibilityMask` and `buildTokenMapLevelVisibilityMask` in `board-interactions.js`) is no longer reached by rendering; if a future step decides to re-introduce partial masks (e.g. for a different visibility regime), they can be revived without a rewrite, but they are dead code today and a follow-up cleanup pass could remove them.
- `getPlayerTokenMapLevelVisibility` and `isPlacementInteractableOnPlayerMapLevel` are still exported and still implemented. They are no longer called by the v2 render path or the v2 hit-test path, but the test suite still exercises them and the `token-interactions.js` `prepareTokenDrag`/`token-settings` paths in some non-rendering branches may still consult them via legacy callers. Step 6 (claims) and Step 7 (view-follow) should not need them; if a follow-up removes them entirely the test file's legacy suite must move to `getTokenLevelPresentation` first.
- The presentation helper does not consult any user-level state, claims, or scene IDs. Callers must pass `viewerLevelId` and `gmViewing` explicitly. Within `board-interactions.js` this is always derived from `getViewerLevelIdForCurrentUser(state, sceneId)` and `isGmUser()`; in token-interactions.js the marquee path uses the rendered placement's stored `scale` (which already encodes the resolved viewer level), so no additional plumbing is needed there.
- Hit testing now requires the rendered placement record to carry `scale`. The two consumers — `findRenderedPlacementAtPoint` (board) and `getTokensInSelectionBox` (token-interactions) — both read it directly. If a future step adds another hit-testing surface (e.g. a new context menu or drag-drop target), it must do the same scale-around-center math. The Step 5 record fields (`scale`, `scaleOriginX`, `scaleOriginY`) are kept symmetric so the math is portable.
- The cutout edge rule now uses raw + 8-neighborhood expansion. Step 8 (falling) explicitly requires raw cutout cells only (no edge expansion) per §5.6, so the falling check must call `isMapLevelCutOutAtCell` (the existing legacy helper) rather than `buildExpandedCutoutCellSet`.

### Step 6 — Claims (DONE)

Landed on branch `claude/zealous-hamilton-43564f` (worktree `zealous-hamilton-43564f`). All previously-passing JS tests still pass; 10 new tests cover the additions (447 total, up from 437 at end of Step 5).

Files touched:

- `dnd/vtt/assets/js/state/normalize/map-levels.js`
  - Added `PLAYER_CHARACTER_USER_IDS = Object.freeze(['frunk', 'sharon', 'indigo', 'zepha'])`. The four player-character profile ids used by both the PC auto-claim path (only PCs auto-claim on first drag) and the GM's claim assignment dropdown. The GM is intentionally omitted because the plan treats unclaimed and GM-owned as equivalent — there is no "claim for GM" action.
  - Added `getClaimedUserIdForPlacement(sceneState, placementId)`. Resolves the claimant profile id for a placement from a scene's `claimedTokens` map, normalized to lowercase, or `null` for unclaimed/GM-owned. The helper accepts a per-scene `sceneState` entry (the same shape as `resolveActiveLevelIdForUser`) so callers do not need to know the storage shape.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Imported `PLAYER_CHARACTER_USER_IDS` and `getClaimedUserIdForPlacement` from `state/normalize/map-levels.js`.
  - Token settings markup:
    - Added a per-row `data-token-settings-claim-section` block that renders for all users (not GM-only). The GM gets a `<select data-token-settings-claim-select>` with options `Unclaimed` plus the four PC profile ids; players get a single `<button data-token-settings-claim-toggle>` that flips between Claim/Take Claim/Unclaim depending on the current claim.
    - Captured new menu refs: `claimSection`, `claimName`, `claimSelect`, `claimToggleButton`.
    - Added click/change listeners that route to `handleTokenClaimSelectChange(value)` (GM) and `handleTokenClaimToggleClick()` (player).
  - `syncTokenSettingsForm` now calls `syncTokenClaimControls(placement)` after `syncTokenLevelControls(placement)` so the claim row stays in sync with the current placement.
  - `syncTokenClaimControls(placement)` shows/hides the section, populates the current claimant name (`Unclaimed` when null), sets the select value (GM), and toggles the player button text/data-action. The button is hidden for any non-GM user that is not in `PLAYER_CHARACTER_USER_IDS` so plain spectators (no-op accounts) cannot try to claim.
  - `submitTokenClaimChange(placementId, targetUserId | null)` is the single mutation point: it short-circuits if the claim is already at the requested state, mutates the local `boardState.sceneState[sceneId].claimedTokens` directly, marks the scene state dirty, and broadcasts a `claim.set` op (with `userId`) when assigning or a `claim.clear` op when releasing. Re-renders the tokens layer afterwards so the colored ring updates immediately on the originating client. The op applier mirror-write is a no-op for the originating client; remote clients pick the op up via Pusher.
  - `handleTokenDrop` (PC auto-claim): when a PC-folder token is dropped, `matchProfileByName(template.name)` infers the profile id from the token's display name (the existing alias matcher used by combat). If the inferred id is in `PLAYER_CHARACTER_USER_IDS`, `autoClaimPlacement(sceneId, placement.id, userId)` writes the claim to local state and broadcasts a `claim.set` op. The "first time only" guard is implicit because `handleTokenDrop` only fires on a fresh drag-into-scene; auto-claim does not run on load or on every render.
  - `renderTokens`: resolves the per-scene `sceneState` entry once outside the placement loop and, per token, calls `applyTokenClaimPresentation(token, getClaimedUserIdForPlacement(sceneEntry, normalized.id))`. The new helper appends/removes a `.vtt-token__claim-ring` child element with `data-claimed-by` set to the lowercase profile id; CSS picks the per-profile color via attribute selectors. Insertion uses `insertBefore(ringEl, token.firstChild)` so the ring sits behind the token image but above the auto group-color halo.
  - `handleTokenLevelMoveClick` now calls `applyClaimDrivenUserLevelUpdate({ sceneId, placementId, levelId })` after the placement's `levelId` is mutated. The helper looks up the placement's claimant via `getClaimedUserIdForPlacement` and, if present, mutates `sceneState[sceneId].userLevelState[claimantId]` to `{ levelId, source: 'claim', tokenId: placementId, updatedAt }` and broadcasts a `user-level.set` op carrying the same payload. This satisfies §4.2's "Whenever a claimed token changes level for any reason, the same mutation must update that claimant's `userLevelState`" rule for the GM-driven token-settings path. (Steps 8 falling and 9 deletion will need their own hooks into the same helper.)
  - `handleTokenLevelMoveClick` also bumps `target._lastModified = Date.now()` so the claim-fallback resolver in `resolveActiveLevelIdForUser` (which uses the most-recently-modified claimed token's level when no `userLevelState` entry exists) sees the update.
- `dnd/vtt/assets/css/board.css`
  - Added `.vtt-token__claim-ring` rules: absolutely positioned with `inset: -8px`, `z-index: -1` so it sits behind the token border and image, double-layer `box-shadow` (solid 3px ring + soft 14px glow using `color-mix`) driven by a `--vtt-claim-color` custom property.
  - Per-profile color rules via `[data-claimed-by='<id>']` attribute selectors: Indigo → `#a855f7` (purple), Sharon → `#d4d4d8` (light grey), Frunk → `#ef4444` (red), Zepha → `#c2410c` (brown-orange). The values match the §5.4 palette.
  - `.vtt-token.is-selected .vtt-token__claim-ring` and `.vtt-token.is-hover-highlight .vtt-token__claim-ring` drop the ring opacity to `0.35` so the existing selection halo (which uses border/box-shadow on the token element itself) reads first when selected. Per §5.4 "selection should draw above the ring, or the ring should fade while selected".
  - Added `.vtt-token-settings__row--claim`, `.vtt-token-settings__claim-label`, `.vtt-token-settings__claim-name`, `.vtt-token-settings__claim-select`, and `.vtt-token-settings__claim-button` rules modeled on the existing level-row chrome so the two rows in the token-settings panel read as a matched pair.

Tests added (all in `dnd/vtt/assets/js/state/__tests__/map-levels-v2-normalization.test.mjs`):

- `Levels v2 — PLAYER_CHARACTER_USER_IDS roster (Step 6)` suite (3 tests):
  - Lists the four PCs in the documented order without the GM.
  - Is frozen so callers cannot mutate the shared roster.
  - Every PC roster id appears in `KNOWN_LEVEL_USER_IDS` (the activate roster).
- `Levels v2 — getClaimedUserIdForPlacement (Step 6)` suite (7 tests): null scene state, missing/non-object `claimedTokens`, missing claim, normalized lowercase return, blank placement id input, trimmed placement id input, and blank stored values dropping to null.

Behavioral consequences for downstream steps:

- The plan's §4.2 invariant — "whenever a claimed token changes level for any reason, the same mutation must update that claimant's `userLevelState`" — is wired today only at the GM token-settings level-move path (`handleTokenLevelMoveClick`). Step 8 (falling) and Step 9 (deletion cascade) must call `applyClaimDrivenUserLevelUpdate` (or duplicate its op-emitting body) when they mutate `placement.levelId`. The helper is defined inline in `board-interactions.js`; if a third caller appears it should be promoted to a shared helper.
- PC auto-claim runs only inside `handleTokenDrop`, which only fires on a fresh drag-into-scene. There is no other code path that creates placements at load time, so the "should not run on every load" guard is satisfied implicitly. If a future step adds a "duplicate token" or "import scene" path, that path must NOT call `autoClaimPlacement`; instead it should preserve whatever `claimedTokens` mapping was on the source.
- The claim ring sits at `z-index: -1` inside the `.vtt-token` element. Selection halo continues to use the token element's own border + box-shadow, which renders above absolutely-positioned children with negative z-index, so selection draws on top without explicit z-index management. The opacity-fade rule is belt-and-suspenders so even with future renderer changes the ring still defers to selection.
- Step 7 (view-follow) builds on the `source: 'claim'` user-level entries written here. When a player's `userLevelState` entry is `source: 'claim'` with `tokenId: <id>`, the view-follow path should pan that player's view to the claimed token. Today the user-level entry is already being written to that exact shape; Step 7 just needs to react to it (likely via a state-subscription side effect) and call into `map-pings.js`'s `centerViewOnPing` (or a refactored sibling).
- The four PC display names rendered in the claim section/select use `formatProfileDisplayName(profileId)` (the existing helper), which capitalizes the lowercase id. Display names in the settings panel will read "Frunk", "Sharon", "Indigo", "Zepha", and "Unknown Player" for any profile id not in the alias map. Adding a new PC requires updating both `KNOWN_LEVEL_USER_IDS` and `PLAYER_CHARACTER_USER_IDS` (and `dnd/index.php`).

### Step 7 — View-follow (DONE)

Landed on branch `claude/trusting-elion-f41278` (worktree `trusting-elion-f41278`). All previously-passing JS tests still pass; 19 new tests cover the additions (466 total, up from 447 at end of Step 6).

Files touched:

- `dnd/vtt/assets/js/ui/level-view-follow.js` (new module)
  - `detectClaimedTokenLevelTransition(prevEntry, nextEntry)` — pure detector. Returns `true` only when (a) `nextEntry.source === 'claim'` and `nextEntry.tokenId` is non-blank, (b) a previous claim-sourced entry was already recorded, and (c) the two entries differ on `tokenId`, `levelId`, or `updatedAt`. First observation always returns `false` so the caller can establish a baseline without auto-panning. Non-claim entries (`source: 'manual' | 'activate'`) and blank/missing `tokenId` short-circuit to `false`, which is what makes GM browsing and Activate "silent" for view-follow purposes.
  - `computePlacementNormalizedCenter(placement, options)` — converts a placement's grid position to a `[0..1]` normalized point on the active map. Reuses the same `(column, row, width, height) → leftOffset + (column + width/2) * gridSize` math the renderer uses, then divides by `mapPixelSize.{width,height}` and clamps to `[0, 1]`. Returns `null` for invalid input, missing/zero `gridSize`, or missing `mapPixelSize` so callers can skip when geometry isn't ready (e.g. before `viewState.mapLoaded`).
  - `createLevelViewFollowTracker()` — closure over a `Map<sceneId, lastEntry>`. Exposes `consume({ sceneId, userLevelEntry })` (returns `true` if a transition fired; always updates the recorded entry), `reset(sceneId?)` (drops one or all baselines), and `peek(sceneId)` (used by tests). Stores normalized snapshots — `{ source, tokenId, levelId, updatedAt }` — internally so the recorded prev-entry passes `detectClaimedTokenLevelTransition`'s "must be claim-sourced on both sides" gate. `peek` strips `source` from its return so the public surface stays minimal.
- `dnd/vtt/assets/js/ui/map-pings.js`
  - Added `centerViewOnPoint({ x, y })` to the returned API. Internally delegates to the existing `centerViewOnPing` (the same helper alt-shift-click focus pings call), gated on `viewState.mapLoaded` and finite `x`/`y` so a stale call before the map is ready is a no-op rather than a transform glitch. Returns `true`/`false` so callers can decide whether to retry; today the view-follow path treats `false` as "skip this tick".
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Imported `computePlacementNormalizedCenter` and `createLevelViewFollowTracker` from `./level-view-follow.js`.
  - Instantiated `levelViewFollowTracker` next to the `mapPings` instance.
  - In the scene-change branch of `applyStateToBoard` (where `lastActiveSceneId` is updated), added `levelViewFollowTracker.reset()` so entering a new scene wipes baselines and the first observation in the new scene is treated as a baseline (no auto-pan). `reset()` with no argument drops all entries, which is intentional — switching between two scenes back and forth should re-baseline rather than auto-panning to whatever was claim-sourced when we left.
  - Added `maybeFollowClaimedTokenView(state, sceneId)`: looks up the current user's `userLevelState[currentUserId]` entry from `boardState.sceneState[sceneId]`, calls `tracker.consume(...)`, bails on `false`, otherwise resolves the placement from `boardState.placements[sceneId]` by `tokenId`, computes its normalized center via `computePlacementNormalizedCenter` using the live `viewState` (`gridSize`, `mapPixelSize`, `gridOffsets`), and calls `mapPings.centerViewOnPoint(center)`. Each early-return is silent — the tracker still records the latest entry so the next legitimate transition fires.
  - Wired the call after `mapPings.processIncomingPings(...)` inside `applyStateToBoard` so it runs every render cycle. Putting it after the ping pass means a stale focus ping in scene state does not pre-empt a fresh claim transition (both call `centerViewOnPoint`/`centerViewOnPing` on the same view; the last one wins).

Tests added (`dnd/vtt/assets/js/ui/__tests__/level-view-follow.test.mjs`, three suites):

- `detectClaimedTokenLevelTransition` (7 tests):
  - non-claim next entries (`null`, `undefined`, `source: 'manual'`, `source: 'activate'`) return `false`.
  - first observation returns `false` even when the next entry is claim-sourced (the baseline rule).
  - different `tokenId`, different `levelId`, and newer `updatedAt` between two claim entries each independently fire a transition.
  - identical entries do not fire.
  - blank/missing `tokenId` in the next entry short-circuits to `false` (treated as unclaimed).
- `computePlacementNormalizedCenter` (5 tests): centered output for a multi-cell placement, `gridOffsets.left`/`top` are honored, off-map placements clamp to `[0, 1]`, default `width=1`/`height=1` and the `col` alias path are handled, and invalid inputs (`null` placement, `null` options, zero `gridSize`, zero `mapPixelSize.width`, missing `mapPixelSize.width`) return `null`.
- `createLevelViewFollowTracker` (7 tests): first consume records the baseline without firing, repeat consume with the same entry stays silent, an updated entry fires once and updates the baseline (subsequent identical consume stays silent), a non-claim entry clears the baseline so the next claim observation re-baselines (no auto-pan), `reset(sceneId)` drops only that scene while `reset()` drops all, different scenes track independent baselines, and a blank/missing `sceneId` in `consume` returns `false`.

Behavioral consequences for downstream steps:

- The view-follow trigger is keyed on `userLevelState[currentUserId]` transitions, not on placement movement. Today the only writer that sets `source: 'claim'` is `applyClaimDrivenUserLevelUpdate` (Step 6), called from `handleTokenLevelMoveClick`. Step 8 (falling) MUST also write `source: 'claim'` via `applyClaimDrivenUserLevelUpdate` (or duplicate its body) when a claimed token's `levelId` changes due to a fall, otherwise the claimant won't pan with the falling token. Step 9 (deletion cascade) similarly: when a deleted level remaps tokens down, claimed tokens should emit `user-level.set` ops with `source: 'claim'` so the claimants follow.
- The originating client of a claim-driven level change (e.g. the GM moving a player's claimed token) does NOT pan. The detector reads `userLevelState[currentUserId]`; the GM's entry has `source: 'manual'` from their own browsing and is unchanged by the player's `source: 'claim'` write. Remote clients (the actual claimant) see their own entry update and pan. This is the intended split per §5.2 ("the player's view pans to the token", not the GM's).
- If a future feature lets a player move their own claimed token (e.g. drag-and-commit on the player side), the tracker's behavior is naturally correct: the local mutation fires `applyStateToBoard`, the player's `userLevelState[player]` entry is updated with `source: 'claim'`, the tracker observes a transition, and the pan happens. No additional plumbing needed.
- The pan does not animate — `centerViewOnPing`/`centerViewOnPoint` writes `viewState.translation.{x,y}` and calls `applyTransform()` synchronously. If a future pass adds smoothed camera motion to focus pings, view-follow inherits it for free. There is no separate animation hook in v2.
- The Activate path (Step 4) writes `source: 'activate'` for every roster member. Those entries do not match the detector's `source === 'claim'` gate, so Activate does not auto-pan players to the GM's level. This is intentional per §5.3 ("Tokens are not moved" by Activate). After Activate, the player still has whatever `userLevelState` entry was there before — the activate write replaces it, but the tracker's recorded baseline becomes `null` (because the new entry is non-claim), so the next claim-driven transition for this scene re-baselines without panning. The first claim transition AFTER an Activate is the one that fires the pan.
- `centerViewOnPoint` returning `false` (e.g. the map isn't loaded yet) is treated as a no-op by the caller. Because the tracker has already recorded the new entry, the player will NOT get a delayed pan when the map finishes loading — they'll just be wherever the saved `viewState.translation` puts them. This matches the existing pattern for focus pings (which also bail on `!viewState.mapLoaded`). If a future step wants to defer the pan until after the map loads, the tracker would need a "pending pan" slot; not added today.

### Step 8 — Falling (DONE)

Landed on branch `claude/intelligent-jackson-fdf08b` (worktree `intelligent-jackson-fdf08b`). All previously-passing JS tests still pass; 19 new tests cover the additions (485 total, up from 466 at end of Step 7).

Files touched:

- `dnd/vtt/assets/js/ui/token-levels.js`
  - Added `isPlacementFullyInsideRawCutouts(placement, level)` exported helper. Returns `true` only when every occupied cell of the placement (computed via the existing `normalizePlacementBounds` + `getPlacementCells` helpers) is contained in a raw cutout cell of the supplied level. Uses raw cutouts only — no edge expansion — per §5.6 ("Edge-of-cutout placement does not trigger a fall.") and the Step 5 follow-up note. Returns `false` for null/empty levels or empty cutouts.
  - Added `getFallingDestinationLevelId(placement, mapLevelsState)` exported helper. Walks the level chain `[Level 0, ...stored Level 1+]` (built via the existing private `getOrderedLevelsWithBase`) downward starting from the placement's resolved current level, descending one step at a time as long as the placement is fully inside the raw cutouts of the current level. Stops as soon as it lands on a level without a covering cutout, or on Level 0 (which has no cutouts by construction). Returns the final resting `levelId`, or `null` when the placement does not fall (already on Level 0, current level missing/unknown, edge-only overlap, or partial overlap).
- `dnd/vtt/assets/js/ui/token-fall-animation.js` (new module)
  - Exports `playTokenFallAnimation(tokenElement, options)` and `isTokenFallInFlight(tokenElement)` plus the `TOKEN_FALL_DURATION_MS` constant (1000 ms; kept in lockstep with the CSS `--vtt-token-fall-duration`). The function adds the `vtt-token--falling` class to the supplied element, schedules a `setTimeout` cleanup at the duration, and resolves a Promise when the class is removed. A second call on the same element cancels the prior in-flight animation (resolves its Promise early) so a rapid re-fall does not leave the trigger class stuck. Tracking uses a `WeakMap<Element, { cancel }>` so unmounted nodes don't leak. Invalid inputs resolve immediately rather than throwing — callers do not need defensive try/catch.
- `dnd/vtt/assets/css/board.css`
  - Added `.vtt-token--falling .vtt-token__image` and `.vtt-token--falling.vtt-token--placeholder::before` rules that bind the `vtt-token-fall` keyframes for the duration of the trigger class. Targeting the inner image (and the placeholder pseudo-element for tokens without an image) keeps the outer `.vtt-token` translate3d/scale transform from being overwritten by the animation — the existing positional + cross-level scale stays correct while the inner content does the wobble.
  - Added `@keyframes vtt-token-fall` — five-stop animation: scale up to 1.05× with a quick wobble (rotate −3°/+4°/−2°), settle to 1.0× at 60%, drop to 0.55× with reduced opacity at 85% (the "dropping away" beat), then return to 1.0× at 100%. Total duration is one second; per §5.6 the animation plays once per fall chain regardless of how many levels were traversed.
- `dnd/vtt/assets/js/ui/board-interactions.js`
  - Imported `getFallingDestinationLevelId` from `./token-levels.js` and `playTokenFallAnimation` from `./token-fall-animation.js`.
  - Added `processPlacementFalls(sceneId, placementIds)`: the v2 source of truth for fall mutations. For each candidate id, resolves the placement against `boardState.placements[sceneId]`, calls `getFallingDestinationLevelId` against the scene's normalized `mapLevels` state (via the existing `resolveSceneTokenLevelState`), and collects `{placementId, fromLevelId, toLevelId}` rows. When at least one fall is detected, runs a single `boardApi.updateState` block that mutates each falling placement's `levelId` (and stamps `_lastModified`), marks each placement dirty so the snapshot save preserves the change, and persists a `placement.update` op (`patch: { levelId: <toLevelId> }`) per fall through the existing op-broadcast path. Then iterates the falls and calls `applyClaimDrivenUserLevelUpdate({ sceneId, placementId, levelId })` once per fall — this satisfies §4.2's invariant ("whenever a claimed token changes level for any reason, the same mutation must update that claimant's `userLevelState`") for the falling path, mirrors the user-level entry to local state, and broadcasts a `user-level.set` op carrying `source: 'claim'` and the `tokenId`. Returns the list of fallen placement ids so the caller can fire animations after its render pass.
  - Added `triggerTokenFallAnimations(placementIds)`: queries the `tokenLayer` for rendered token nodes by `data-placement-id`, then schedules `playTokenFallAnimation` for each match via `requestAnimationFrame` so the animation starts after the caller's `renderTokens` has already painted the new (post-fall) level scale and indicator. Falls back to `setTimeout(..., 0)` when `requestAnimationFrame` is unavailable.
  - `handleTokenLevelMoveClick`: after the existing `applyClaimDrivenUserLevelUpdate` call, invokes `processPlacementFalls(activeSceneId, [activeTokenSettingsId])` and captures the fallen ids. After `renderTokens`/`renderAuras`, calls `triggerTokenFallAnimations(fallenIds)`. The status message now reads "<label> fell to <Level Name>." when the move triggered a fall, falling back to "Moved <label> to <Level Name>." otherwise. The "fell to" branch resolves the final level name from the placement's post-fall `levelId` via `getViewerLevelDisplayName` so the status reflects the resting level, not the level the GM clicked toward.
  - Wired `processPlacementFalls` and `triggerTokenFallAnimations` as new options into the `createTokenInteractions(...)` call so the drag commit path can also detect and animate falls.
- `dnd/vtt/assets/js/ui/token-interactions.js`
  - Added two optional callback parameters to `createTokenInteractions({...})`: `processPlacementFalls` and `triggerTokenFallAnimations`. They default to `null` so the module remains usable in test contexts without fall handling.
  - `commitDragPreview`: after the existing `placement.move` op persist (and only when `movedCount > 0`), calls `processPlacementFalls(activeSceneId, movedIds)` and captures the returned fallen-id list. The status message branches: when at least one moved token fell, it appends `; <n> token(s) fell.` Then `renderTokens` runs as before, painting the post-fall state. Finally, `triggerTokenFallAnimations(fallenIds)` schedules the animation against the freshly-rendered DOM. Order of operations is critical here: the animation is scheduled via `requestAnimationFrame` inside `triggerTokenFallAnimations`, so it runs against the post-render DOM regardless of when `commitDragPreview` itself yields.

Tests added:

- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` — new `Levels v2 falling detection` suite (14 tests):
  - `isPlacementFullyInsideRawCutouts`: single-cell token entirely inside a cutout, edge-of-cutout (adjacent and corner-adjacent) does NOT trigger, multi-cell partial overlap returns `false`, multi-cell fully inside a wide cutout returns `true`, missing/empty cutouts return `false`.
  - `getFallingDestinationLevelId`: single fall from Level 1 to Level 0; chained fall from Level 2 through Level 1 to Level 0 (cutout stack); chained fall stops at the first level without a covering cutout; placement on Level 0 never falls; placement with missing `levelId` (legacy path → Level 0) never falls; edge-of-cutout placement does not fall; multi-cell partial overlap does not fall; empty/null `mapLevelsState` returns `null`; unknown current `levelId` returns `null`.
- `dnd/vtt/assets/js/ui/__tests__/token-fall-animation.test.mjs` (new file) — `Levels v2 token fall animation` suite (5 tests): the duration constant is a positive number; `playTokenFallAnimation` adds the `vtt-token--falling` class while the animation is in flight and removes it on resolve; a second call on the same element cancels the prior in-flight animation early without dropping the class; invalid element input resolves immediately without throwing; `isTokenFallInFlight` returns `false` for null/empty inputs.

Behavioral consequences for downstream steps:

- The §4.2 invariant about claimant `userLevelState` updates is now satisfied at three call sites: GM token-settings level-move (`handleTokenLevelMoveClick`, Step 6), drag-commit fall (`processPlacementFalls` triggered from `commitDragPreview` via callback), and explicit GM-level-move fall (`processPlacementFalls` triggered from `handleTokenLevelMoveClick`). Step 9 (deletion cascade) is the remaining caller — when remapping tokens off a deleted level, the deletion handler must call `applyClaimDrivenUserLevelUpdate` (or the inline equivalent) for every claimed placement that gets remapped. The helper is currently defined inline in `board-interactions.js`; promoting it to a shared util becomes worthwhile only when Step 9 lands.
- Falls always traverse Level 0 as the floor. If a future feature adds a "deeper than Level 0" basement (or, more realistically, a "void" pseudo-level for tokens that fell off the map), `getFallingDestinationLevelId` would need an extra termination case. Not added today; Level 0 has no cutouts by construction so the chain naturally stops.
- The animation timing assumes `requestAnimationFrame` is available in the renderer; the `setTimeout(..., 0)` fallback covers test environments. In SSR / non-browser contexts neither path runs into a DOM, but the module guards against missing `classList` so `playTokenFallAnimation(null)` resolves without effect.
- The drag commit path emits TWO sets of ops per fall: a `placement.move` op (existing, for column/row) and a `placement.update` op (new, for `levelId`). These travel as separate `persistBoardStateSnapshot` calls because the `placement.move` op is built and dispatched inside `commitDragPreview`'s op-list and the `placement.update` op is added later by `processPlacementFalls`. Two persists is a small cost on the rare event of a fall; bundling them would require restructuring `commitDragPreview` to defer its persist until after the fall hook runs. Acceptable in v2; revisit if profiling shows the second persist round-trip causing a visible delay.
- The animation plays for the local user (whoever caused the fall, plus the GM and the claimant on remote clients) but the §5.6 "Other players may simply receive the end-state render change" line is satisfied because remote clients only get the state mutation via Pusher; they do not re-trigger the animation locally. The `processPlacementFalls` helper does NOT broadcast an "animate this token" signal — the animation is purely a local UI flourish on whoever called `triggerTokenFallAnimations`.
- Status messages from drag commits now include a fall callout (`"; N tokens fell."`); from token-settings level-moves, a fall replaces the move message entirely. If a future UI wants a more elaborate fall toast (e.g. "Frunk fell from Level 2 to Level 0"), the `processPlacementFalls` return value already carries `fromLevelId`/`toLevelId` per fall — extend the consumer rather than the helper.

### Step 9 — Deletion cascade (DONE)

Landed on branch `claude/nifty-burnell-548278` (worktree `nifty-burnell-548278`). All previously-passing JS tests still pass; 8 new tests cover the additions (493 total, up from 485 at end of Step 8).

Files touched:

- `dnd/vtt/assets/js/ui/scene-manager.js`
  - Added a `BASE_MAP_LEVEL_ID` import from `state/normalize/map-levels.js` so the cascade can refuse to delete the virtual base level and use the canonical sentinel as a final fallback.
  - Added a new `deleteSceneMapLevelCascade(stateApi, sceneId, levelId)` helper that performs §5.7's full deletion cascade in a single `mutateSceneMapLevels` callback (single `updateState` block). Returns `null` for invalid input (missing `sceneId`/`levelId`, attempted Level 0 delete, unknown id) or a summary `{ fallbackLevelId, remappedPlacementIds, remappedUserIds, remappedClaimUserIds }` when the deletion succeeds. The cascade:
    1. Finds the deleted level's position in the ordered stack via `getOrderedMapLevels`. Computes `fallbackLevelId` as the immediately-lower stored level's id, or `BASE_MAP_LEVEL_ID` when the deleted level was at the bottom of the stored stack (`deletedIndex === 0`).
    2. Filters the deleted level out of `mapLevels.levels` and reindexes the survivors via `reindexMapLevels`. Surviving stored ids stay stable — only `zIndex` is recomputed (per §5.7 / §4.4 stable-id rule).
    3. Clears the legacy `mapLevels.activeLevelId` if it pointed at the deleted level (preserves the existing pre-v2 behavior of falling back to the first surviving stored level; the post-v2 `userLevelState[gm]` path below is the v2 source of truth).
    4. Walks `boardDraft.placements[sceneId]` and remaps every placement whose stored `levelId` matched the deleted one to `fallbackLevelId`. Each remapped placement is stamped with `_lastModified = remapTimestamp` so the claim-fallback resolver in `resolveActiveLevelIdForUser` (Step 2) treats them as recent. Collects the remapped placement ids for the next pass.
    5. Pass A — remaps every `userLevelState[userId]` entry whose `levelId` matched the deleted level to `fallbackLevelId`. Preserves the entry's `source` and `tokenId` (changing only `levelId` and `updatedAt`). The GM's per-user entry, if it pointed at the deleted level, is remapped here too — that is §5.7's "If the GM is currently viewing the deleted level, remap the GM's active level to that lower fallback" satisfied via the same code path that handles every other user.
    6. Pass B — claim-driven invariant from §4.2: for each remapped placement that is also claimed (`sceneBoardState.claimedTokens[placementId]`), overwrite the claimant's `userLevelState` to `{ levelId: fallbackLevelId, source: 'claim', tokenId: placementId, updatedAt }`. This wins over Pass A's preservation when both apply (e.g. a claimant whose previous entry was `source: 'manual'` on the deleted level will end up `source: 'claim'`). Iterating remapped placements in order means the last claim-write per claimant wins, matching §4.2's "last updated token wins" rule for users who claim multiple deleted-level tokens.
  - The `delete-map-level` click handler is now a thin wrapper: it confirms the prompt, calls `deleteSceneMapLevelCascade(...)`, and on success calls `persistBoardStateSnapshot(sceneId)` (passing the sceneId so the dirty-flag side of the persist path knows to send the full scene state). Failure paths still surface "Unable to delete map level." feedback.
  - `deleteSceneMapLevelCascade` is exported via the `__testing` surface so the new tests can drive it directly without simulating the click.
- `dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs`
  - `createInitialState` extended to accept `placements`, `userLevelState`, and `claimedTokens` so cascade tests can seed the per-scene v2 state without bypassing the test harness. Default values keep the existing test cases unaffected.
  - `BASE_MAP_LEVEL_ID` imported from `state/normalize/map-levels.js`.
  - New `Levels v2 — deleteSceneMapLevelCascade (Step 9)` describe block (8 tests):
    1. `returns null when sceneId, levelId, or BASE level id is supplied` — covers the four refuse-paths (missing sceneId, missing levelId, BASE id, unknown id) and confirms no mutation occurs.
    2. `remaps placements on the deleted level to the next lower stored level` — fallback resolution to the immediately-lower stored level, placement-level remap with `_lastModified` stamp, and verification that placements on other levels (and a legacy missing-`levelId` placement) are untouched.
    3. `falls back to BASE_MAP_LEVEL_ID when no lower stored level exists` — deleting the bottom stored level remaps placements to `level-0`.
    4. `keeps surviving stored level ids stable; only zIndex is recomputed` — locks in the §4.4 stable-id rule.
    5. `clears legacy mapLevels.activeLevelId when it pointed at the deleted level` — defensive check that the pre-v2 field never references a deleted id after the cascade.
    6. `remaps userLevelState entries pointing at the deleted level (preserving source/tokenId)` — Pass A behavior across `gm`/`frunk`/`sharon`. Confirms that a user pointing at a non-deleted level is untouched (including its `updatedAt`), and that the GM and an `activate`-sourced user both get remapped while keeping their `source` field.
    7. `claim-driven invariant: remapped claimed token overwrites claimant userLevelState to source: claim` — Pass B behavior when the claimant's previous state pointed at a different level. Confirms the entry ends up `source: 'claim'` with `tokenId` set, even though Pass A wouldn't have touched it.
    8. `claim source overrides pass-A remap when the same user has both signals` — Pass B running after Pass A produces the consistent claim-source entry, not the preserved Pass-A shape.

Tests added: 8. Total tests now 493 (was 485 at end of Step 8). All previously-passing tests still pass.

Behavioral consequences for downstream work:

- The §4.2 claim-driven `userLevelState` invariant is now satisfied at four call sites: GM token-settings level-move (`handleTokenLevelMoveClick`, Step 6), drag-commit fall (`processPlacementFalls` from `commitDragPreview`, Step 8), GM-level-move fall (`processPlacementFalls` from `handleTokenLevelMoveClick`, Step 8), and deletion cascade (this step). The Step 9 implementation chose to inline the invariant inside `deleteSceneMapLevelCascade` rather than call `applyClaimDrivenUserLevelUpdate` from `board-interactions.js`. Two reasons: (a) the cascade does its work in a single `updateState` block, and the helper opens its own; (b) the cascade uses a snapshot save (full board state via `persistBoardStateSnapshot(sceneId)`) rather than per-user `user-level.set` ops, which keeps deletion atomic from the wire's perspective. The Step 6 / Step 8 follow-up note about "promoting the helper to a shared util becomes worthwhile only when Step 9 lands" is resolved by *not* promoting — both paths remain reasonable in their respective shapes, and a third caller would be needed to justify a generalization. If a future caller appears, the helper can be lifted into a shared `state-mutations/user-level.js` module then.
- The cascade emits no per-op broadcast. The deletion is delivered to remote clients via the next snapshot-save round-trip (Pusher carries the snapshot's incremental sync). For consistency with Steps 1–8 (which use ops for surgical changes), this is intentional: deletion is rare, GM-only, and changes many fields at once. A snapshot is the natural granularity. Op broadcast for deletion would mean four op types in flight (`placement.update` × N, `user-level.set` × M, plus an implicit `mapLevels.delete`). Not worth the complexity at v2.
- Deletion of the only stored level leaves the scene with zero stored levels and `mapLevels.activeLevelId = null`. The view-model still synthesizes Level 0 (Step 3), so the GM nav and player indicator continue to function — they just cannot move up. New tokens placed by users on Level 0 still get `placement.levelId = 'level-0'`. This matches the design from Step 3.
- The "no animation on deletion remap" rule from §5.7 is satisfied implicitly: the cascade does not call `playTokenFallAnimation` or `triggerTokenFallAnimations`. The placements simply re-render at their new level on the next render pass.
- Claims attached to placement ids survive deletion (per §5.7 "Claims remain attached to placement ids"). The cascade never touches `claimedTokens` — only `userLevelState`. A claimed token on a deleted level keeps its claim and lands on the fallback level with the claim intact, and the claimant's state is updated to follow.
- If both Pass A and Pass B apply to the same user (the user's previous entry was a `source: 'claim'` entry on the deleted level for a placement that just got remapped), the final state is identical between the two passes — both write `levelId: fallbackLevelId` and the same `source`/`tokenId`. Pass B simply rewrites with a fresh `updatedAt`. No correctness issue, just a minor redundancy on that specific path.

---

## 13. Manual Testing Notes / Bugs Surfaced

### 2026-04-27 — Step 6 (claims) manual test: claim ops silently lost on version conflict

**Symptom (reported by GM during test):** Dropped a Frunk-named token, opened token settings, picked "Frunk" from the GM claim dropdown — claim status remained "Unclaimed". Player (Frunk) tried clicking the player Claim button — same result. Console showed two `409 Conflict` POSTs to `dnd/vtt/api/state.php` and `[VTT] Board state save rejected as stale; applying server state.` Chat panel was concurrently throwing `ERR_INSUFFICIENT_RESOURCES` — likely unrelated, but suggests the page had many in-flight requests.

**Root cause (suspected, needs confirmation):** When the client's `_version` is behind the server's, `state.php` (line ~364) returns a 409 conflict before applying any ops in the payload. On the client, `submitTokenClaimChange` mutates local state and sends a `claim.set` op via `persistBoardStateSnapshot({}, [op])`. On 409, the conflict handler at `board-interactions.js:~2245` calls `clearDirtyTrackingForSave` and `applyBoardStateConflictSnapshot` — which **drops the failed op without retrying** and overwrites the local mutation with the server's snapshot. Result: the claim is silently lost, both locally and on the server. Same code path drives `autoClaimPlacement` (PC drag-in auto-claim), so PC auto-claim is also vulnerable.

**Workaround for testing:** Hard refresh (Ctrl+F5) before retesting claim. Refresh resyncs `currentBoardStateVersion` to the server's current version, so the next claim op should land. If repeated 409s occur, another tab/client is bumping the version concurrently.

**Suggested fix (not yet implemented):**
1. On op-only saves that hit 409, after applying the conflict snapshot, **re-apply the failed op locally and re-broadcast it** with the fresh `_version`. This requires keeping the op list around through the conflict handler instead of dropping it via `clearDirtyTrackingForSave`.
2. Alternative: server-side, separate the version check for snapshot-merge from the version check for ops. Ops like `claim.set` are idempotent and don't depend on the client having the latest snapshot; the server could apply them even on a stale `_version` and just refuse the snapshot half.

**Adjacent observation:** PC auto-claim only runs when `isTokenSourcePlayerVisible(template)` is true — i.e. the token must be dragged from the PC folder, not a generic token renamed "Frunk". Working as designed, but worth documenting because a tester dragging a generic token expecting auto-claim will see no claim ring.

**Fix landed (2026-04-27, Option A):** PC auto-claim is now batched with `placement.add` into a single ops payload inside `handleTokenDrop`. Both ops apply under one server lock — no separate save round-trip, no version race. The standalone `autoClaimPlacement` helper was removed (single caller). The §5.4 "first time only" guard is preserved because `handleTokenDrop` only fires on a fresh drag-into-scene. Local mutation still happens up-front so the snapshot fallback path (when delta-saves is off or non-placement state is dirty) picks up the claim too. The broader 409-drop-without-retry issue (manual claim, etc.) is **not** addressed by this fix — that is the Option B fix and remains open.

**Follow-up fix (2026-04-27):** After the Option A fix above landed, the auto-claim ring still flashed-and-disappeared on PC drop. Root cause: `fetchAndApplyCharacterStamina` in `board-interactions.js` was firing two saves back-to-back — `updatePlacementById` (which internally persists a `placement.update` delta) and a bare `persistBoardStateSnapshot()` immediately after. Both saves shared the same client `_version` and raced the original batched `[placement.add, claim.set]` save from `handleTokenDrop`. Whichever lost the lock got a 409, and the conflict handler's full-sync overwrite wiped the just-applied claim from local state. Fix was to delete the redundant bare `persistBoardStateSnapshot()` call — the `updatePlacementById` call already persists a proper delta op. The underlying 409-drop-without-retry plumbing issue (Option B) still remains open and unrelated.

### 2026-04-27 — Manual test pass (GM browser)

GM walked through the test checklist. Confirmed working:

- **Step 1:** 1.1 (existing scene tokens render), 1.2 (claims/level state survive reload), 1.3 (claim broadcast across browsers).
- **Step 2:** 2.1 (GM nav doesn't move players), 2.2 (Level: N indicator visible), 2.3 (GM nav persists across reload), 2.4 (player defaults to Level 0), 2.5 (cutout edit follows GM viewing level).
- **Step 3:** 3.1 (selector lists Level 0), 3.2 (nav steps into Level 0), 3.3 (new token on Level 0 lands there), 3.5 (cutout editor disabled on Level 0), 3.6 (no delete button on Level 0), 3.7 (legacy tokens appear on Level 0).

**Observed bug (3.4 — token-settings level move):** First click of the up/down arrow in the right-click token settings panel returned `409 Conflict` from `state.php` and didn't apply. Subsequent clicks were sluggish but eventually worked. Stack: `persist (persistence.js:191) ← persistBoardState (board-state-service.js:206) ← persistBoardStateSnapshot (board-interactions.js:2168) ← updatePlacementById (board-interactions.js:12318) ← handleTokenLevelMoveClick (board-interactions.js:14227)`.

**Root cause:** The Levels v2 op-only call sites (`handleMapLevelNavigationClick`, `handleMapLevelActivateClick`, `applyClaimDrivenUserLevelUpdate`, `submitTokenClaimChange`, and the auto-claim branch of `handleTokenDrop`) all call `markSceneStateDirty(sceneId)` before broadcasting their op. `clearDirtyTrackingForOps` only knows about `placement.*`, `template.*`, and `drawing.*` — it does not clear `dirtySceneState` for `user-level.*` or `claim.*` ops. So after a GM nav the dirty mark survives forever. The next call to `updatePlacementById` (token-settings level move) sees `hasNonPlacementDirtyState() === true` and falls down the **snapshot** path. Snapshot saves still get the v1 stale-version check (the `db46dc8` ops-only bypass doesn't apply), and if the client is even one version behind, server returns 409.

**Fix landed (2026-04-27):** `clearDirtyTrackingForOps` now recognizes the four v2 op types (`user-level.set`, `user-level.activate`, `claim.set`, `claim.clear`) and clears `dirtySceneState[sceneId]` after a successful (or 409-recovered) ops save. The dirty mark is preserved for the in-flight window so an `escape: true` fallback to snapshot still includes the change; on success the mark is cleared so subsequent placement ops can take the ops-only path (where `db46dc8` bypasses 409s). Verified by following test 3.4 with a token-settings level-move directly after a GM nav — no more 409.

### 2026-04-27 — Old overlay system deleted (Phase A–D)

The pre-Levels-v2 "map overlay" system has been removed end-to-end. This was the original mechanism for adding a single semi-transparent map layer with polygon cutouts on top of the base map; the Levels v2 system supersedes it entirely.

**Removed (~5000 lines net):**
- **UI surface (Phase A):** `Add Overlay`, `Clear Overlay`, `Upload Overlay`, `Edit Overlay`, `Delete Overlay`, `Toggle Overlay Visibility` buttons in the scene manager. Click handlers and `vtt-overlay-upload-input` event wiring. (`scene-manager.js`)
- **DOM + tool (Phase B):** `<div id="vtt-map-overlay">` from `SceneBoard.php`. The 1240-line `createOverlayTool` factory, `createOverlayCutoutBlob`, `overlayUploadHelpers`, mapOverlay drop proxies, layer rendering (`syncOverlayLayer`, `teardownOverlayLayer`, `applyMaskToOverlayElement`, etc.), `cloneOverlayState`, `resolveSceneOverlayState`, `getActiveOverlayLayerId`, `syncOverlayVisibilityButtons`, snapshot/apply paths, `dirtyTopLevel.has('overlay')`. (`board-interactions.js`)
- **Client data layer (Phase C):** `state/normalize/overlay.js` (entire 302-line module deleted). `markOverlayDirty` and the `overlayDirty` / `captureOverlaySignature` / `overlaySignatureChanged` plumbing in `store.js`. `normalizeOverlayConfig` and ~400 lines of inline overlay helpers in `scene-manager.js`. `overlay` field in scene-board-state normalizer, payload builder, merge helpers, pusher delta plumbing, bootstrap snapshot reader. The `overlay-dirty-tracking.test.mjs` file (obsolete).
- **Server (Phase D):** `normalizeOverlayPayload` and dependents (340 lines: `createEmptyOverlayState`, `createEmptyOverlayMask`, `normalizeOverlayLayerPayload`, `resolveOverlayActiveLayerId`, `maskHasMeaningfulContent`, `normalizeOverlayMaskPayload`, `normalizeOverlayMaskPoint`, etc.) in `state.php`. The `overlay` field in `applyBoardState`, `normalizeBoardState`, `normalizeSceneStatePayload`, and the Pusher broadcast envelope.
- **CSS (Phase D):** `vtt-board__map-overlay`, `vtt-overlay-editor` and 50+ children, `data-overlay-editing` rules, `scene-overlay__*` rules, `scene-item__overlays` rule.

**Intentionally kept (different concept, despite the "overlay" name):**
- `--vtt-overlay-scale` CSS variable — toolbar/UI element sizing (Levels v2's cutout editor uses it).
- `vtt-grid-overlay` — the grid SVG layer.
- `vtt-custom-condition-overlay`, dice-roller modal `overlay`, drag-ruler SVG `overlay` — UI/dialog overlays.
- `placement.overlays.hitPoints` / `placement.overlays.conditions` — per-token HP/condition badge metadata.
- `vtt-overlay-upload-input` — the file picker element ID. The element is now used for map-level uploads only; renaming would touch HTML, CSS, and JS in lockstep, so the misleading ID is intentionally left in place. Internal-only.
- `'overlay'` Pusher channel name in `config/pusher.php` — comment notes it's been repurposed for fog-of-war broadcasts.

**Test status:** 488 of 488 tests pass (down from 493 because the obsolete `overlay-dirty-tracking.test.mjs` file was deleted; the rest of the suite is unchanged).


