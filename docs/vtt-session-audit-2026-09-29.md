# Post-session maintenance audit

This audit covers the nine reported session issues. Local fixed-code tests and
the existing production session are separate evidence: production still runs
1.19.183 until its code is deployed. No cPanel installation is included.

## Ability chains and modifiers

The normal Bifurcated Incineration chain completed in the live browser. The
intermittent disappearance was not reproduced. A deterministic runner defect
could leave the chain pending forever when a roll/chat callback rejected; the
runner now propagates that failure and cleans up the picker. Repeated clicks
cannot dispatch another roll while the first is awaiting its callback.

Live testing also reproduced an unreported issue: cancelling initial target
selection consumed the main action despite no roll, effect or resource spend.
Action consumption now starts at execution rather than opening the ability.
Partial or uncertain execution remains spent; effects are never replayed.

Independent automatic edges now add up to two, rather than taking the largest
single suggestion. Opposing edges and banes cancel after each side is capped at
two. The source-book rule grants an edge against a prone target to **melee**
abilities. A ranged attack from a cliff therefore gets one edge from high ground,
not a second edge from prone alone. High ground compares the attacker's feet with
the top of the target's space. Manual overrides remain available.

A separate VTT surge lookup referenced an out-of-scope `routes` variable; it now
uses the runner's configured character endpoint. Its regression exercises an
actual lookup through that endpoint.

## Movement, delivery and outages

An unchanged recovery request no longer decodes every map in the world. Revision
metadata and complete contiguous events are sufficient; missing/retained-away
events still require the authoritative snapshot. Repeated reads in one store
instance reuse one decoded snapshot, invalidated by writes or external database
changes. This cache does not persist between requests.

Healthy polling retains its 500 ms cadence. Failed polls back off, do not overlap
explicit recovery, and respect bounded Retry-After delays. Commands retain their
operation IDs and existing transport retry limits. Server movement validation,
collision receipts, zone queues and ownership checks remain in place.

An isolated synthetic eight-scene world containing about 10 MB of JSON measured
an unchanged fresh-store recovery at 122.07 ms before this change and 2.16 ms
afterward. The JSON decode alone measured 114.69 ms; revision-only replay measured
0.0054 ms. These local medians demonstrate removed work, not a promise of that
speedup for live token moves. Fake-time sustained-503 coverage reduced attempted
polls from 120 to 6 per minute per client while preserving normal recovery.

The user's outage description shows browser/Cloudflare working and the host
failing. This suggests an origin response/reachability problem, but no error code,
timestamp or production hosting logs are available. Reduced CPU work and failed
request traffic remove plausible load contributors; they do not establish the
cause of past outages or prove the host issue is resolved.

Small accepted changes continue to use entity commands/events. Initial HTML and
snapshot recovery still carry substantial world data. Event and snapshot retention
are bounded; durable operation and effect receipts intentionally remain because
deleting them can turn an old retry into a second spend or effect. The read-only
storage audit tool reports counts and sizes without deleting data or exporting
saved character/map contents. Local fixture sizes are not production measurements.

## Respite, roll readability and confirmation placement

Unchanged sheet polling no longer rebuilds the sheet or VTT card. It preserves an
open respite confirmation and focus. Reads started before a local save cannot
restore the pre-save sheet or stamina afterward; polling pauses during queued
saves. Forced VTT refreshes arriving during an existing read request one fresh
read afterward. Existing write order and uncertain-write protection remain.

A loopback browser journey confirms a respite saves VP 0, adds the previous VP to
XP, restores stamina/recoveries, and converges to VP 0 in the mounted VTT card.
It also holds an old read over the save and proves it cannot restore VP 8.
This does not prove that a particular historical respite was confirmed or saved;
no production PC was given a respite as a test.

Selected roll tiers now use dark readable text on their existing pale background,
including disabled selected buttons. The same browser fixture verifies text
contrast. Hero-token confirmations retain their existing wording and buttons,
but appear outside the scrolling panel, flip to the other side near an edge and
stay within the viewport. Replacement/cancellation resolves the pending prompt.
Four-corner browser checks prove both buttons remain reachable.

## Verification boundaries

The final complete npm suite passed **945 tests across 135 files**. Focused
regressions cover runner failure/cancellation, modifier rules,
resource lookups, snapshot invalidation, contiguous replay and failure backoff.
`node dnd/vtt/tools/test-session-ui-resource-browser.cjs` passes against a disposable
loopback server with fake character storage and no campaign commands or sessions.

The real roof-renderer browser fixture injects a first-image-request 503. Before
recovery, the roof remains opaque and the closed interior ray remains blocked.
The next request restores artwork without reload. Roof/stair image loading now
has three bounded retries rather than caching a failure forever. Existing cube
cutaway and Wall teleport chooser checks pass. See
[the performance and roof audit](vtt-performance-audit-2026-09-29.md) for details.
This fixes a reproduced recovery glitch; unspecified visual glitches remain
unreproduced and this is not exhaustive vision coverage.

The final live-state restoration record follows when that audit completes. No
production latency improvement or deployment of the fixed code is claimed.
