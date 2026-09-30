# Sync recovery, storage and roof audit — September 29, 2026

These are local code/fixture results. No deployment, campaign data cleanup or
durable receipt pruning was performed. The live browser's inline bootstrap
configuration measured 5,284,085 bytes. That is initial page data, not the size of
an ordinary movement command. Available live-browser tooling did not expose API
timings or a network trace; local timings below must not be presented as hosting
response times.

## Recovery and requests

Healthy fallback recovery remains every 500 ms. Previously `replayAfter` read and
decoded the entire world even when the client was already current. It now reads
only the revision. A bounded event range must be contiguous through that captured
revision; retention gaps and limit overflow still return a canonical snapshot.
Reading `updated_at` alongside the cursor also loads SQLite overflow pages because
that column follows the large JSON record, so idle recovery deliberately reads
only `revision`.

One decoded snapshot is cached per store instance/request. SQLite `data_version`
and world revision detect foreign writes; own writes invalidate the cache. PHP
copy-on-write isolates callers and audience projections. No projection, permission,
canonical transaction or accepted-operation replay boundary changes.

`benchmark-sync-performance.php` creates its own temporary SQLite world with eight
copies of the supplied read-only Bathhouse package (9,999,593 JSON bytes). Warm
medians over 25 runs, with ten fresh-store request samples:

| Local operation | Before | After |
| --- | ---: | ---: |
| Empty recovery, full decode versus cursor lookup | 114.69 ms | 0.0054 ms |
| New store plus empty recovery | 122.07 ms | 2.16 ms |
| Repeated snapshot lookup within one request | full decode | 0.0083 ms |

Existing optimized Bathhouse movement checks measured 53.5, 18.0, 2.6 and 78.7 ms
for four blocked paths, and 5.1 ms for one allowed path. Those geometry improvements
precede this network work; these measurements do not prove hosted movement latency
or characterize every slam/forced-movement path.

Failed background recovery backs off exponentially to 30 seconds and respects a
bounded Retry-After header (up to 60 seconds). A fake-time immediate-503 scenario
made six requests in a minute instead of 120. Explicit recovery and command/Pusher
acknowledgments bypass this background cooldown; healthy 500 ms polling resumes
after success. Command retry count and immutable operation/body remain unchanged,
but HTTP 408/429/5xx transport retries respect Retry-After.

HTTP errors already retained status. They now also expose validated, bounded
CF-Ray and X-Request-ID identifiers on the existing error object. No response HTML,
credentials, persistent error logs or new UI are added.

Bootstrap still carries all projected scenes and the runtime obtains a canonical
snapshot on startup. Removing that duplicate or narrowing inactive scenes needs a
scoped snapshot/browsing contract, rather than reconstructing canonical data from
the display normalizer or silently dropping geometry. The token-library stamina
poller already coalesces in-flight requests and refreshes visible library entries
once per minute. The chat bridge's 100 ms interval is a bounded startup check, not
a network poller. Character-summary polling is addressed separately in the session
audit. Presence remains tied to healthy recovery because its five-second online
cutoff is used by requested-test recipient behavior.

## Storage

`audit-sync-v2-storage.php` opens an existing database with SQLite `mode=ro` and
`query_only`, without constructing/migrating an authority store. It reports only
sizes/counts, not saved player content. Measurements:

| Database | Physical bytes | Current world JSON | Events | Durable operations | Snapshots |
| --- | ---: | ---: | ---: | ---: | ---: |
| Repository local store | 69,632 | 354 | 0 | 0 | 1 / 46 bytes |
| Disposable vision-performance fixture | 115,372,032 | 21,859,167 | 885 / 24,453,692 bytes | 885 / 24,663,144 bytes | 10 / 43,224,582 bytes |

The large disposable fixture includes 42 repeated scene imports. Its growth is not
evidence of a production movement leak. Both measured WAL files were absent/zero;
the fixture had no free database pages at measurement time.

Default event retention is 1,000 revisions. Periodic snapshots are every 100
revisions with 20 retained; configured snapshot retention is bounded to 2..200.
The operation ledger is intentionally indefinite: it preserves original outcomes
after event retention pruning. Scene-import outbox receipts, collision-effect
claims and zone-entry claims also retain durable deduplication/recovery evidence.
They must not be pruned or replaced with smaller generic responses without an
explicit replay policy, including retired-operation rejection. Checkpoint archives
use explicit deletion. Shadow observations are already capped at 200; presence is
one row per world/user. No vacuum, deletion, compression or pruning was performed.

## Roof image recovery and visibility

The renderer cached a null image before fetching. A failed roof/stair fetch left
that entry permanently null, so subsequent paints could not recover until reload.
An injected first-request 503 reproduces it. The image cache now makes at most
three delayed retries (1, 2 and 4 seconds) per image, deduplicates simultaneous
requests and increments renderer revision on success. A permanently missing image
cannot produce an unbounded repaint/fetch loop. Null local lookups use that same
budget. While requested artwork is loading or unavailable, its existing geometry
retains opaque cover and the normal doorway/interior cutaways. Geometry, sight and
collision are unchanged.

The static real-renderer browser regression passed a 503-first roof request followed
by successful artwork recovery without reload. The closed interior remained
physically hidden while the image was unavailable, with an opaque black roof pixel
covering the underlying map. It also verified exterior
roof cover beside/on temporary wall cubes, inside-building cutaway, classification
cache refresh and the real Wall teleport dialog. Unit tests cover finite retries
and renderer invalidation. This is a concrete image-recovery fix, not a claim that
all unspecified visual glitches have been reproduced.

The reported Cloudflare screen showed browser/Cloudflare working and the site host
failing. That suggests origin reachability or response trouble, but no exact status,
timestamp, hosting log or matching CF-Ray was supplied. Reduced server decode cost
and outage polling reduce contributors; they do not establish or fix the hosting
failure's cause. Correlate the next HTTP status and identifier with origin logs.

## Verification

The PHP authority wrapper passed all 24 checks, including cache isolation, foreign
and same-revision writes, rollback, contiguous recovery, gap/limit fallback and
durable retries after event deletion. Focused request/runtime/foundation tests
passed. The final complete checked-in suite passed **945 tests across 135 files**.
