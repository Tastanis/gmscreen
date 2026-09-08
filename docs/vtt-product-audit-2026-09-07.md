# Draw Steel VTT product audit

Reviewed September 7, 2026. Source checkout: `main`, commit `a728acc`; local version file: 1.19.9, build 253.

## Recommendation

Make the next milestone **reliable multi-floor play**. You already have substantial VTT coverage. The greatest improvement will come from finishing the connections between tools, permissions, persistence, and Draw Steel rules, followed by reducing the work required to operate the interface during a session.

The current Sync V2 foundation is worth keeping. This audit found feature paths that do not use it correctly; it does not establish a need for another synchronization rewrite.

## Scope and evidence

- Read the current VTT, Sync V2 handoff, relevant Draw Steel reference, and the separate diagnostic repository.
- Ran the 75 existing VTT and ability-automation `.test.mjs` files separately: **669 passing tests, zero failures**, including the PHP SQLite authority integration test invoked by that suite.
- Built a disposable localhost app from current source with downloaded token/scene metadata and read-only access to downloaded images. The library contained 101 tokens and 28 scenes. A synthetic two-floor test scene was used for interaction checks; its board state was not represented as a live production snapshot.
- Used separate GM, Cal, and Sharon browser contexts. Exercised a player stair drag, GM level movement, player refresh, drawing persistence, and GM panels at 1440×900 and 1280×720. Also tested authenticated template commands and several geometry helpers directly.
- Application source, existing campaign data, and production were not edited. Test activity was confined to [the disposable audit folder](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07). This report is a new file.
- The browser used local HTTP recovery, with Pusher disabled and external browser requests blocked. Production deployment parity, external Pusher behavior, a full-session soak, mobile play, and every individual ability were not verified.

## Confirmed problems to fix first

### 1. Players cannot complete a stair transition

**Browser reproduced.** A player dragged Cal through a correctly configured stair. The ordinary move returned HTTP 200 and changed the token's position. The following `placement.batch` returned HTTP 422:

> Only the GM may change placement field: levelId

The canonical token remained on Level 0. The browser displayed a generic placement-save failure. Sending the corresponding patch as GM succeeded, and the same accepted event correctly updated Cal's linked viewer level.

The stair UI sends a level patch, but the server forbids that field for players. Fall handling submits the same forbidden patch, so it has the same permission mismatch; that fall path was traced in code rather than separately reproduced with a browser drag.

**Next step:** Give legitimate stair/fall transitions a server-validated command path. Validate the transition against the scene and token, then accept position, destination floor, and relevant viewer changes together. Keep arbitrary floor editing GM-only. Do not solve this by opening all placement fields to players.

Evidence: [stair dispatcher](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/stairs-trigger.js:290), [fall handling](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/board-interactions.js:21450), [server restriction](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/lib/SyncV2Store.php:2470), [browser results](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/browser-audit-results.json).

### 2. Freehand drawings can appear successful without being saved

**Browser reproduced.** A player drew a visible line. The local drawing count became 1, the GM saw 0, canonical storage contained 0, and refreshing the player returned the local count to 0. No drawing command was submitted.

The drawing callback updates local state, while the persistence bridge remains inside `syncDrawingsFromState`. The former broad board subscriber has been removed. This is an example of an older feature losing its connection during the synchronization migration.

**Next step:** Have drawing creation, erase, clear, and undo explicitly submit the appropriate Sync V2 drawing commands. Apply acknowledged results through the existing reducer. Also finish floor binding: drawings normalize a `levelId`, but the drawing tool does not assign the current floor and its renderer does not filter by floor.

Evidence: [drawing callback](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/bootstrap.js:67), [persistence bridge](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/board-interactions.js:7835), [drawing creation](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/drawing-tool.js:317), [renderer](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/drawing-tool.js:881), [browser results](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/drawing-results.json).

### 3. Players can create templates but cannot remove them

**Authenticated local API reproduced; removal UI traced.** A player's `template.upsert` succeeded. Removing that same template returned HTTP 422: “This board-domain command is GM-only.” The UI offers Delete/Backspace removal without a matching player restriction.

**Next step:** Decide the intended template permissions and enforce them consistently in the UI and server. A practical default is that players can edit/remove their own measurement templates, while the GM can manage all. Authored persistent effects may need different permissions from temporary measurement shapes.

Evidence: [server permissions](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/lib/SyncV2Store.php:1912), [template Delete handler](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/board-interactions.js:25326), [command results](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/drawing-results.json).

### 4. Floor geometry disagrees with combat suggestions

**Direct runtime-helper reproductions:**

- The first stored upper floor receives `zIndex: 0`. High Ground also treats the virtual base floor as rank 0, so the first upper floor does not activate that suggestion against the base floor.
- Flanking was marked active when the supporting ally was on a different floor, across a solid floor with no connecting opening. Its adjacency calculation uses only horizontal coordinates.
- With a hidden intermediate floor, a falling token's helper result was that hidden floor for the full GM model, but Level 0 for the player model with hidden floors removed.

**Next step:** Centralize the meaning of floor order, physical elevation, adjacency, and floor participation in one geometry layer. Apply it to range guides, flanking, auras, free strikes, forced movement, falls, and target eligibility. Floor order alone cannot prove Draw Steel High Ground: the rules depend on occupied vertical space and whether the creature is standing/climbing appropriately. Until those facts exist, keep uncertain bonuses as explicit manual suggestions.

Also define flight/hover/jump behavior, support beneath large tokens, and whether hiding a floor merely hides artwork or removes a physical surface. Those are design gaps to resolve, not mechanics to infer from image opacity.

Evidence: [upper-floor creation](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/scene-manager.js:1073), [High Ground ranking](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/power-roll-suggestions.js:107), [Flanking](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/power-roll-suggestions.js:195), [fall helper](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/assets/js/ui/token-levels.js:711), [reproduction results](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/geometry-results.json), [local Draw Steel combat reference](C:/Users/tasta/Desktop/gmscreen/dnd/ai-reference/source/rules-v1.01b/chapters/chapter-10-combat.md:519).

### 5. The diagnostic copy misses the current board authority

**Repository verified.** The separate `runtime/local-vtt-app` has no `SyncV2Store.php`; its board interaction file is dated July 28. The sync registry includes the legacy `board-state.json`, scenes, tokens, and media, but not a logical export of canonical V2 board state. Its downloaded board JSON is dated July 28, while token metadata is newer.

**Next step:** Make the diagnostic workflow pair a known source revision with a consistent logical V2 snapshot and referenced assets. Record export time, source revision, schema version, and world revision. Restore that export into a fresh local SQLite database and exercise it automatically. A raw copy of an active SQLite file alone is not a sufficient snapshot procedure when WAL is involved.

The downloaded assets remain useful. They should be distinguished from a current, restorable copy of the live board.

Evidence: [diagnostic registry](<C:/Users/tasta/Desktop/gm screen test repository/website/dnd/admin/sync/data-registry.php:29>), [current SQLite authority](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/lib/SyncV2Store.php:20).

## UI changes with the highest immediate payoff

1. **Open the library first.** In Tokens, put search, folders, recent/favorite tokens, and saved results first. Move the large crop/upload form behind “Create token.” At 1280×720, that form consumes nearly the entire panel before saved tokens become visible. [Screenshot](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/gm-laptop-tokens.png).
2. **Open saved scenes first.** The Scenes panel similarly leads with upload, calibration, and scene creation. Put those under “New scene” and “Edit scene”; use the opening view for searching and selecting prepared scenes. Folders already exist and should be retained. [Screenshot](C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/vtt-audit-2026-09-07/gm-scenes.png).
3. **Make floor actions explicit.** Show separate labels for “Viewing: Balcony” and “Token: Ground.” Rename Activate to “Bring players here,” with an obvious scope. Add “Follow my character,” “Browse floors,” and “Center on my token.” A GM moving another character through stairs should not unexpectedly lose their chosen working view without a clear policy.
4. **Distinguish exploration and combat layouts.** The waiting/completed tracker occupies a large top strip even before combat. Collapse it outside combat; expand when an encounter begins. Keep the action toolbar reachable when sidebars open.
5. **Use a compact combat character card.** Prioritize stamina, recoveries, resource, surges, conditions, and actions. Put skills, languages, background, and full details behind a tab or expandable section. Preserve the existing information.
6. **Make navigation discoverable.** Add visible zoom percentage, +/−, Fit Map, Center Selected, and a shortcut guide. Keep the existing wheel/right-drag controls. Use persistent selected-tool labels so Draw, Measure, stairs, and cutout editing do not feel like unexplained pointer behavior.
7. **Explain rejected actions.** Preserve the actual server reason in user-facing feedback, offer recovery where appropriate, and visibly distinguish pending from accepted changes. “Your latest change may not be shared yet” conceals a permanent permission rejection. A successful unrelated action should not imply that a failed action was saved.
8. **Make the theme easier to read.** Keep the established visual style, but use opaque panel backgrounds, clearer body text, larger practical click targets, and fewer competing borders. The screenshots show board controls bleeding through translucent sidebars. Hide the development memory counter behind diagnostics.

These are interface recommendations based on the reviewed desktop layouts; they are not claims of a completed accessibility or mobile audit.

## Roll20-style capability roadmap

The benchmark is a fast, dependable tabletop workflow. Roll20's documented baseline includes selection/panning, measurement, drawing, dice, turn tools, and fog; scene/page organization and handouts are also established parts of its workflow. Your app already implements many of these. [Roll20 toolbar](https://help.roll20.net/hc/en-us/articles/360039674753-Toolbar-Overview), [page folders](https://help.roll20.net/hc/en-us/articles/360039675413-Page-Menu-Folders), [character sheets and handouts](https://help.roll20.net/hc/en-us/articles/360039223834-Roll20-Crash-Course).

| Capability | What is already here | Recommended next addition |
|---|---|---|
| Tabletop basics | Scenes/folders, token library, selection, movement, ruler, pings, templates, fog and levels | Finish permissions, persistence, floor binding and discovery |
| Draw Steel combat | Team-based turns, Malice, minions, resources, conditions, PC and monster ability tools | One authoritative action lifecycle, visible manual steps, consistent triggers across entry points |
| GM visibility | Hidden tokens/floors and player projections | Preview as a specific player, including that player's floor, fog and interaction permissions |
| Mistake recovery | Movement/drawing/cutout undo mechanisms and internal recovery snapshots | Clear scoped undo plus named encounter checkpoints and a tested scene restore flow |
| Adventure preparation | Scene and token folders; substantial Strixhaven content elsewhere | Saved encounter groups, scene duplication/export, favorites and recent items |
| Information at the table | Chat/whispers and character/monster panels | Handouts, show-image-to-players, map pins linked to existing campaign records |
| Terrain and visibility | Fog, cutouts, visual walls/templates; some manual combat suggestions | Real movement/line-of-effect barriers, doors, difficult/damaging terrain; dynamic lighting later |
| Player setup | Sheet links and shared allied control | Configurable roster and explicit primary token per player; retain shared allied movement as the current default |

Map-linked notes are a useful model for connecting your existing campaign tools to the board: Roll20 pins can link handouts, have GM/player notes, and be revealed separately. [Roll20 Map Pins](https://help.roll20.net/hc/en-us/articles/36271267343639-Map-Pins).

For terrain, separate “blocks movement,” “blocks sight,” and “blocks line of effect.” A decorative wall shape should not imply all three. Doors should have open/closed/locked states and clear interaction permissions. Roll20's implementation illustrates the operational value of these controls. [Roll20 doors and windows](https://help.roll20.net/hc/en-us/articles/11462645998999-Placing-Doors-Windows).

I would put built-in voice/video, elaborate lighting effects, marketplaces, and large generic compendiums behind the work above. For this campaign, dependable rules interactions, encounter preparation, and map-linked information offer a more immediate benefit.

## Blind spots to address deliberately

- **GM-only testing hides permission failures.** Both stairs and template removal illustrate this. Test actual player sessions for every player-facing action.
- **A passing unit suite does not prove a complete workflow.** The current suite passes while drawing never reaches the server. Add tests that begin with a user gesture and end with another browser and a refresh agreeing on the result.
- **Camera, token location, and permissions are different concepts.** Preserve the intentional shared-allies movement model. Define a primary token for camera/sheet association independently. The server and client currently hardcode the same four PC profile IDs, which will make a new player, renamed character, companion, or duplicate token harder to handle cleanly. [Server roster](C:/Users/tasta/Desktop/gmscreen/dnd/vtt/lib/SyncV2Store.php:12).
- **Automation should declare its limits.** Show “automatic,” “needs confirmation,” or “manual” at the relevant step. Cover already has a manual boundary because reliable obstruction geometry is not modeled; similar uncertainty should not silently become a rules bonus. [Automation registry](C:/Users/tasta/Desktop/gmscreen/dnd/character_sheet/ability-automation/REGISTRY.md:124).
- **Multi-step actions need recovery.** Define what happens after spending a resource but cancelling targeting, losing connection during a prompt, receiving simultaneous triggers, or deleting the source token. Existing prompt ownership and deduplication should be extended and tested, not replaced.
- **Maintenance concentration increases regressions.** `board-interactions.js` is 27,122 lines and approximately 1 MB. As fixes land, extract floor transitions, geometry, drawing commands, and action orchestration behind narrow interfaces. Avoid a broad rewrite before the failing journeys are covered.
- **Recovery snapshots are not a complete backup strategy.** Add an export/restore drill covering canonical board state, scene metadata, token library, images, sheets, and automation. The repository also still lists external Pusher credential rotation and a GM-plus-two-player production soak as outstanding sign-off work; external completion was not verified here. [Operating boundary](C:/Users/tasta/Desktop/gmscreen/docs/vtt-sync-v2/README.md:726).

## Suggested implementation order

| Milestone | Deliverable | Definition of done |
|---|---|---|
| 1. Close broken workflows | Player stairs/falls, drawing save/replay, template permissions | GM and two players agree; refresh preserves results; rejection restores a clear consistent view |
| 2. Make floors coherent | Shared floor/elevation rules and predictable camera following | Cross-floor combat, hidden floors, duplicate PCs, deletion, and all movement methods have defined tested outcomes |
| 3. Speed up live play | Library-first panels, scene browsing, compact combat mode, explicit tools and navigation | Common actions are reachable without scrolling through creation forms at 1280×720 |
| 4. Add recovery and visibility tools | Player preview, checkpoints, useful connection status, current diagnostic export | GM can diagnose a player's view and restore a disposable exported encounter successfully |
| 5. Extend session preparation | Encounter presets, handouts/map pins, scene export and better asset organization | Prepare an encounter once and reuse it without rebuilding its board setup |
| 6. Add physical terrain | Movement/line-of-effect barriers, doors, terrain costs, then lighting | Terrain and every related rules suggestion use the same geometry and permission rules |

Minimum floor regression set: GM/player/other-player mover; full drag versus incremental movement; stairs in both directions; stop halfway then reload; undo; large tokens partially over a hole; chained falls; hidden or deleted intermediate floors; disconnected linked player; duplicate PC tokens; forced movement versus willing movement; target and aura across floors; floor-bound templates/drawings; scene switch during an action.

The first implementation task should be **player stair/fall transitions with a browser regression test**, immediately followed by **drawing persistence**. Those improvements directly remove failures players can encounter today.
