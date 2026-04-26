# VTT Levels v2 — Plan

This document plans the upgrade of the map-levels system in the VTT. It is written so that another developer (or future Claude session) can understand **what** we are trying to accomplish and **why**, even if they choose a different implementation.

If something here conflicts with how you'd build it, the **Goals** sections take priority over the **Implementation** sections — keep the goal, change the mechanism.

---

## 1. Background

The VTT supports stacking multiple maps in a single scene ("levels"), with grid-cell cutouts in upper levels that reveal levels below. Today:

- The first uploaded map in a scene is the implicit "base map" and is **not** part of the levels list. Tokens cannot be assigned to it.
- Tokens carry a `levelId` and can be moved up/down between numbered levels (1, 2, 3…) but **never to the base map**.
- The "active level" is a single global value per scene — every viewer (GM and players) sees the same level as active. Players have no notion of "what level am I on".
- The GM sees every token at every level all the time, with no indication of which level a token belongs to.

The goal of this rework is to (a) fix the missing base-level affordance, (b) give every user a personal "current level" that affects what they see, and (c) give the GM clear at-a-glance information about which level any token is on.

---

## 2. Concept Glossary

These terms are referenced throughout the plan. Read this section first.

- **Level 0 / Base level** — The first map uploaded to a scene. It behaves like any other level for the purposes of token placement, the level selector UI, and the active-level mechanic. **Unlike levels 1+, it cannot have cutouts** (there is nothing below it to reveal).
- **Level N** — Stacked maps above the base. Levels 1, 2, 3… are unchanged in numbering from today.
- **Active level (per user)** — The single level a given user is currently "on". Determines: (a) what tokens render at full size, (b) what tokens are hidden vs. shrunk, (c) which level new tokens get placed onto.
- **Activate (GM action)** — A GM-only button that forces every connected user's active level to match the GM's current viewing level. This is a one-shot push, not a binding subscription.
- **Claim** — A per-scene assignment of a token to a specific user. A claimed token "belongs to" that user for view-following purposes. The four PC tokens (Indigo, Sharon, Frunk, Zepha) auto-claim to the user with the matching name when first dragged into a scene.
- **Cutout edge rule** — A token whose cells are within 1 grid square of a cutout (treated as if the cutout were 1 square larger in every direction) is visible across the cutout. Applies symmetrically: tokens above can be seen from below, and tokens below can be seen from above.
- **Fall** — When a token ends a move *entirely* inside a cutout area, it automatically drops to the next level down. If it lands inside another cutout, it keeps falling until it doesn't, or until it hits level 0.

---

## 3. Goals (in priority order)

1. **Tokens can live on the base map.** Treat the base map as level 0. Everywhere the level UI says "level 1, 2, 3…" it should now say "level 0, 1, 2, 3…". Tokens already in scenes do not need to be renumbered.
2. **Each user has a personal active level.** What you see depends on where you are. Players' active level is driven by their claimed token; the GM's is driven by their up/down nav buttons.
3. **GM can pull everyone to a specific level on demand** via an explicit "Activate" button. Browsing levels with up/down does **not** affect anyone else.
4. **Tokens above/below the viewer are visually distinct.** Below = green ▼N, smaller. Above = red ▲N. Same level = no indicator, full size.
5. **Players cannot see through solid floors/ceilings.** They see same-level tokens normally, and they see lower/upper-level tokens **only** through cutouts (per the edge rule).
6. **The GM always sees every token, with size and arrow indicators that make level instantly readable** at a glance.
7. **Players can claim NPC tokens** in addition to their PC. The GM can assign any token to any player.

---

## 4. Feature Specifications

### 4.1 Level 0 / Base Map

**Goal:** The first uploaded map in a scene is a real, addressable level — visible in the level selector, valid as a `levelId` on tokens, and treated identically to levels 1+ everywhere except that it can't be cut out.

**Behavior:**
- The level selector lists "Level 0" (or "Base") at the bottom alongside Level 1, 2, 3…
- Tokens can be moved to level 0 via the existing "level up/down" controls in the token settings panel.
- New tokens placed by a user whose active level = 0 are placed on level 0.
- Cutouts cannot be drawn on level 0 (no level below to reveal). The cutout editor is disabled / hidden when level 0 is the active GM viewing level.
- Level 0 cannot be deleted.

**Migration:**
- Existing scenes: the base map continues to live in its current `mapUrl` field at the scene root. Level 0 is a *virtual* level entry derived at read-time from that field. Existing levels stored as `levels[0]`, `levels[1]`, etc. keep their current ids and numbering.
- Tokens currently lacking a `levelId` (or with `levelId === null`) are treated as being on level 0.

---

### 4.2 Per-User Active Level

**Goal:** Each connected user has their own current level. This is what controls what they see and where their newly placed tokens land.

**Behavior:**
- **GM:** Active level is whichever level the GM is currently viewing via the existing top-right up/down nav. Moving up/down changes the GM's active level only — no other user is affected.
- **Player without a claimed token in this scene:** Defaults to level 0 on scene load. Stays on level 0 until the GM "Activate"s a level (then jumps to that level) or the GM gives them a token (then jumps to that token's level).
- **Player with a claimed token:**
  - On scene load, active level = their token's current level.
  - When their claimed token's level changes for any reason (GM moves it, it falls, GM uses the level up/down buttons in the token settings panel), the player's active level snaps to match. The player's view also pans to the token's location, using the same mechanism as the GM's existing alt-right-click "snap player view" function.
  - If multiple level changes happen at the same instant (e.g., GM activates a level the same tick a PC token falls), **the PC token's level wins** for that player.

**Persistence:**
- Each user's last-viewed active level (per scene) persists across page reloads and logouts. On reload, restore the level they were on. This applies to GM and players.

**Display:**
- Every user (including players) sees a "Level: N" indicator in the top-right corner.
- The GM additionally sees the up/down nav buttons and the "Activate" button (see 4.3).

---

### 4.3 Activate Button (GM only)

**Goal:** Let the GM force every connected user to a specific level when needed (e.g., starting an encounter on the second floor). It is intentionally distinct from the GM browsing levels — browsing is silent.

**Behavior:**
- Sits in the top-right level controls, under or next to the up/down nav.
- Clicking it sets every connected user's active level to the GM's current viewing level. Tokens are **not** moved — only views.
- Players whose claimed token is on a different level still get pulled by Activate. The next time their token changes levels, the "follow your token" rule kicks back in (4.2).
- No persistent "follow GM" mode. Each click is a one-shot push.
- The previous "selected level for cutout editing" UI is **removed**. The GM's currently viewed level is always the level the cutout editor operates on.

---

### 4.4 Token Claim System

**Goal:** Replace name-based PC↔user matching with explicit per-scene claims, so that any user can be tied to any token (a familiar, a summoned creature, a guest character) and the level-following logic in 4.2 applies.

**Data model:**
- Per scene: `claimedTokens: { [placementId]: username }`. One claim per token. A new claim by a different user replaces any prior claim.
- A user may claim multiple tokens. All of their claimed tokens drive level-follow behavior; in practice, when *any* of their claimed tokens changes level, their view snaps to it (the most recently moved one wins if multiple move).

**Defaults:**
- All tokens are unclaimed (effectively GM-owned) by default.
- The four PC tokens (Indigo, Sharon, Frunk, Zepha) auto-claim to the matching user **the first time they are dragged into a scene**, using the existing token-name = username convention. This auto-claim only fires on initial drag, not on every load. It must not break the existing character-sheet linkage that uses the same naming convention — claim is a separate per-scene field that lives alongside, not replacing, the name.
- Changing scenes resets claims to "all GM, plus the four PC auto-claims when their tokens are first placed in that scene".

**Player UI:**
- Right-clicking a token (or opening its settings panel) shows a small "Claim" button. Clicking claims the token for the current player.
- Right-clicking a token already claimed by another player still shows "Claim" — clicking it transfers the claim to the clicker.

**GM UI:**
- Right-clicking a token shows a "Claim" submenu listing every user (GM, Indigo, Sharon, Frunk, Zepha…). The GM can assign the token to themselves or force-assign it to any player.
- A "Release" / "Unclaim" option returns the token to the GM (the default unclaimed state).
- Each user's right-click shows the current claimant ("Claimed by: Indigo") for transparency.

**Visual indicator on the map:**
- Claimed tokens get a colored ring drawn around them. Color per user:
  - Indigo → purple
  - Sharon → light grey
  - Frunk → red
  - Zepha → brown-orange
  - GM → no ring (GM is the default; ring is only for player ownership)
- The ring must not interfere with the existing selection visual. Preferred approach: when a claimed token is selected, the ring becomes more transparent (or the selection visual draws on top), so both states remain readable. Pick whichever is least invasive in the current renderer.

---

### 4.5 Visibility Rules

**Goal:** Make it instantly clear which level each token is on, while preserving the cutout-based reveal mechanic players already understand.

#### 4.5.1 Same level

- Token renders at 100% size, no arrow indicator. Standard behavior.

#### 4.5.2 Tokens below the viewer's active level

- **Player:** Visible only if (a) the token sits within the cutout footprint of the level directly above it, OR (b) the token is within 1 grid square of that cutout's edge (cutout-edge rule). Multi-level visibility (player on 0 looking at a token on 2) requires that the edges align through every intermediate level — a cutout in level 1 must overlap the relevant edge of the cutout in level 2 for vision to pass through. Opposite edges of the cutout are irrelevant; only the edge revealing the token in question must align.
- **GM:** Always visible regardless of cutouts.
- **Size:** Shrunk by 10% per level of distance, additively (1 below = 90%, 2 = 80%, 3 = 70%, 4 = 60%, 5 = 50%). Cap at 50% (clamp at 5+ levels apart). Applies to both player and GM views.
- **Indicator:** Green down arrow with the level distance: ▼1, ▼2, ▼3… Visible to whoever can see the token (GM always; players only when the cutout rules allow).

#### 4.5.3 Tokens above the viewer's active level

- **Player:** Visible only via the cutout-edge rule, applied symmetrically — a token on a level above is visible if it's within 1 grid square of a cutout in its own level, with edge alignment through any intermediate cutouts (same logic as below, mirrored).
- **GM:** Always visible regardless of cutouts.
- **Size:** **Not** shrunk. Tokens above render at 100% size for everyone. (This is intentional — users intuitively read "smaller = farther down".)
- **Indicator:** Red up arrow with the level distance: ▲1, ▲2, ▲3…

#### 4.5.4 Hit area / clickability

- Shrunk tokens use a hit area scaled to match their visual size. If the existing renderer ties hit area to displayed size automatically (CSS-based bounding boxes), no extra work is needed; otherwise scale the hit area alongside the visual.

#### 4.5.5 Edge rule precise definition

For any cutout on level N, compute the set of grid cells "visible across" that cutout as: the cutout cells themselves, plus any cell sharing an edge or corner with a cutout cell. A token on level N+1 (looking up from N) or level N-1 (looking down from N) is visible if **any of its occupied cells** falls inside this expanded set.

A token's occupied cells are its grid footprint (1×1, 2×2, etc.). The token's circle visual is contained within that footprint, so 1-pixel visual overlaps that don't change the cell footprint do **not** count.

For multi-level visibility (viewer 2+ levels away from token), the expanded sets at each intervening cutout level must overlap on the path between viewer and token — not the entire cutout, just the edge through which sight is passing.

---

### 4.6 Falling Animation

**Goal:** When a token is moved entirely over a cutout, it visually "drops" to the next level down, with feedback that makes the level change feel intentional rather than glitchy.

**Trigger:**
- After any token movement (drag-drop, arrow keys, GM-driven move) ends, check whether **every** occupied cell of the token sits inside the cutout area of the token's current level. If yes, fall.
- "Entirely inside" means every cell of the token's footprint is a cutout cell on the token's current level. Edge-of-cutout placement does not trigger a fall.

**Animation (per-token, ~1 second total):**
1. Scale up by +5% (~100ms ease).
2. Quick wobble: contract left side, then right side, twice (~250ms total).
3. Scale down by 15% from the +5% peak (so net −10% from original) over ~100ms.
4. Token moves to the next level down. Re-render at the viewer's current size for that level.

**Who sees the animation:**
- The user whose claimed token is falling sees it.
- The GM sees it.
- Other players see only the end result (token disappears from their level if it was visible, or appears on theirs if it landed there). Animation should be cheap enough that we could broadcast it to all viewers without cost concerns, but the spec is: animate for the GM and the token's claimant only.

**View follow:**
- If the falling token is the user's claimed token, after the animation the user's active level snaps to the new level and their view pans to the token (per 4.2). The token returns to 100% size in their view at the new level.
- If the falling token is *not* the user's claimed token, the user's view stays where it is. They simply see the token vanish from / appear in their current level's render based on the new visibility rules.

**Chained falls:**
- If the token lands inside another cutout on the level below, it keeps falling. The animation **does not replay** for subsequent drops — the token snap-jumps through remaining levels until it lands on a level where it's not entirely in a cutout, or it reaches level 0 (level 0 has no cutouts, so falling always stops there at the latest).
- The total animation time for an N-level fall is still ~1 second — animation plays once at the start, then snap-drops finish instantly.

**Concurrency:**
- Multiple tokens falling simultaneously animate independently.

---

### 4.7 Level Deletion

**Goal:** Deleting a level shouldn't strand tokens or leave gaps in the level numbering.

**Behavior:**
- Tokens on the deleted level drop to the level immediately below (no animation — this is an editor action, not gameplay).
- Levels above the deleted level renumber down by 1 (delete level 3 → level 4 becomes 3, level 5 becomes 4). Token `levelId` references update accordingly.
- Level 0 cannot be deleted.

---

## 5. Data Model Changes

### 5.1 Scene state (per-scene additions)

In `boardState.sceneState[sceneId]`:

```jsonc
{
  "mapLevels": {
    "levels": [...],          // existing — level 1, 2, 3...
    "activeLevelId": null     // existing — REMOVED in v2 (active level is now per-user)
  },
  "claimedTokens": {           // NEW
    "<placementId>": "<username>"
  },
  "userLevelState": {          // NEW — per-user persisted active level for this scene
    "<username>": "<levelId or 'level-0'>"
  }
}
```

Notes:
- `activeLevelId` at the scene level becomes obsolete because every user has their own. Keep the field readable for migration but stop writing to it. Reads fall back to `userLevelState[currentUser]` or default (PC token's level → level 0).
- Use the sentinel string `"level-0"` (or null, document the choice) for the base map's level id everywhere `levelId` is referenced. Token placements with `levelId === null` are treated as level 0.

### 5.2 Token placement

No new fields. `placement.levelId` is reused, with `null` / `"level-0"` now being a valid live value rather than an "unassigned" state.

### 5.3 Server endpoints

- New endpoint (or extend an existing one) to update `claimedTokens[placementId]` and broadcast via Pusher. Same op-style mutation as token moves.
- New endpoint (or extend) to update `userLevelState[username]` and broadcast. Players write to their own entry; GM "Activate" writes to all entries at once.

---

## 6. Implementation Map (file-by-file)

This is a starting point — actual edits may touch more files than listed. File references from the codebase exploration.

### 6.1 Data model & normalization

- [`dnd/vtt/assets/js/state/normalize/map-levels.js`](dnd/vtt/assets/js/state/normalize/map-levels.js)
  - Surface a virtual "level 0" entry derived from the scene's base `mapUrl` when iterating levels.
  - Treat `levelId === null` as level 0 in helpers.
  - Drop `activeLevelId` from required state (keep readable for migration).
- [`dnd/vtt/assets/js/state/normalize/placements.js`](dnd/vtt/assets/js/state/normalize/placements.js)
  - Helpers that resolve a placement's level should return level 0 when `levelId` is null.
- New normalizer for `claimedTokens` and `userLevelState` in scene state.

### 6.2 Rendering

- [`dnd/vtt/assets/js/ui/map-level-renderer.js`](dnd/vtt/assets/js/ui/map-level-renderer.js)
  - Drive `dataset.activeMapLevelId` from per-user active level instead of scene `activeLevelId`.
  - Render base map as a level layer in the stack (it's already the bottom — make it part of the level loop instead of a special case).
- [`dnd/vtt/assets/js/ui/token-levels.js`](dnd/vtt/assets/js/ui/token-levels.js)
  - Implement the cutout-edge expansion (1-cell buffer around cutouts) and the multi-level alignment check for visibility.
  - Implement size scaling per level distance (90/80/70/60/50%, capped).
  - Implement arrow indicator overlays (▲N red, ▼N green) on token render.
  - Implement claim color ring overlay; coordinate with selection visual.

### 6.3 UI controls

- [`dnd/vtt/assets/js/ui/board-interactions.js`](dnd/vtt/assets/js/ui/board-interactions.js)
  - Top-right level nav: render a "Level: N" label visible to everyone; show up/down + Activate buttons only to GM.
  - Wire Activate button to a new endpoint that pushes the GM's level to all users' `userLevelState`.
  - Right-click context menu: build a small menu (player view shows "Claim"; GM view shows "Claim → [user list]" plus current claimant + Release).
  - Remove the sidebar level-select-for-cutout-editing control (cutout editor now follows GM's current viewing level).
  - Hook into token-move handlers to detect "entirely in cutout" and trigger the fall animation + level-down logic.
  - Reuse the existing GM alt-right-click view-snap function for the "follow your claimed token" pan.
- [`dnd/vtt/assets/js/ui/scene-manager.js`](dnd/vtt/assets/js/ui/scene-manager.js)
  - Level deletion: cascade tokens down 1 level, renumber upper levels, update all token `levelId` refs.
- [`dnd/vtt/assets/js/ui/token-interactions.js`](dnd/vtt/assets/js/ui/token-interactions.js)
  - Auto-claim PC tokens on first drag-in: when a token whose name matches a known PC username is placed in a scene that doesn't yet have a claim for it, set the claim.
  - Hit area: confirm that scaled-down tokens use scaled hit areas (the renderer uses CSS bounding boxes, so this should be automatic — verify).

### 6.4 Persistence & sync

- [`dnd/vtt/api/state.php`](dnd/vtt/api/state.php)
  - Accept and persist `claimedTokens` and `userLevelState` in scene state.
  - New op types for: claim/unclaim, set-user-level, activate (broadcast set-user-level for all).
- [`dnd/vtt/assets/js/services/pusher-service.js`](dnd/vtt/assets/js/services/pusher-service.js)
  - Handle the new op types in the incoming-op switch.

### 6.5 Falling animation

- New module (e.g., `dnd/vtt/assets/js/ui/token-fall-animation.js`) for the +5% / wobble / −15% sequence. Keep it CSS-keyframe based for cheapness.

---

## 7. Non-Goals / Out of Scope

- **Persistent "follow GM" mode for players.** Activate is a one-shot. If we want a sticky mode later, add it then.
- **Polygon cutouts.** Cutouts remain grid-cell-based.
- **Per-user fog of war.** Visibility here is purely level-based, not line-of-sight.
- **Cross-scene claim persistence.** Claims reset when the scene changes.
- **Animation broadcast to non-claimant players.** Only the claimant and the GM see the fall animation; others see the end-state change.

---

## 8. Open Questions for Implementation

These weren't fully nailed down in design and may need a quick check before / during build:

1. **Where does the per-user level indicator render for players?** Top-right was specified for GM. Same position for players, just without the buttons? Confirm during UI work.
2. **Right-click menu styling.** Project doesn't currently have a custom context menu (right-click is suppressed). We'll need to design a small one for Claim. Match the visual style of the existing token settings panel.
3. **Auto-claim race conditions.** If two clients place the same PC token simultaneously into a scene (unlikely but possible), the server should resolve to one claim. Use last-writer-wins on the existing `_version` mechanism.
4. **Mid-fall claim changes.** If a player claims a token while it's mid-fall, the new claimant doesn't get the animation (it's already playing for someone else). Acceptable.
5. **GM browsing while another user falls.** The GM sees the fall animation regardless of which level they're currently viewing — but the token may not be visible at all on the GM's current level. Expected behavior: animation plays only if the token would be rendered at all (i.e., if same-level or above/below within the visibility rules). If invisible, the GM just sees nothing — the level change still applies silently.

---

## 9. Build Order (suggested)

1. **Data model migration**: virtual level 0, `claimedTokens`, `userLevelState` schemas + normalizers. No UI changes yet.
2. **Per-user active level + level 0 in selector**: GM browses including level 0; players default to level 0; persist across reloads. No claims yet.
3. **Activate button**: GM force-pushes level to all users.
4. **Visibility rules**: shrinking, arrows, cutout-edge logic. Test with hand-placed tokens.
5. **Claim system**: right-click menus, color rings, auto-claim PCs.
6. **View-follow**: claimed token level changes snap player view.
7. **Falling animation**: end-of-move cutout detection, animation, chained drops.
8. **Level deletion cascade**: tokens drop, levels renumber.

Each step should be independently shippable / testable. Steps 1–3 deliver visible value (level 0 + per-user active level + Activate) before claim mechanics land.
