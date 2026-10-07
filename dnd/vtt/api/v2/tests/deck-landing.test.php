<?php
declare(strict_types=1);
require __DIR__ . '/../../../lib/SyncV2Store.php';
function deckCheck($ok, $message) { if (!$ok) throw new RuntimeException($message); }
// A rope bridge at height 2 whose end is laid over the landing square; the land there is a hair higher (2.02).
$bridge = ['id' => 'bridge', 'kind' => 'floor', 'levelId' => 'level-0', 'height' => 2.0, 'points' => [['x' => 2, 'y' => 1], ['x' => 9, 'y' => 1], ['x' => 9, 'y' => 2], ['x' => 2, 'y' => 2]]];
$levels = ['levels' => []];
$land = fn($p) => $p['column'] < 2.5 ? 2.02 : 0.0;
$onLanding = ['column' => 2, 'row' => 1, 'width' => 1, 'height' => 1, 'levelId' => 'level-0'];
deckCheck(FloorSupport::terrainContact($onLanding, [$bridge], $levels, 2.02) === null, 'Standing still, the strict rule is unchanged');
deckCheck((FloorSupport::terrainContact($onLanding, [$bridge], $levels, 2.02, .1)['id'] ?? null) === 'bridge', 'Level within a tenth of a square counts for movement');
deckCheck((FloorSupport::walkContact($onLanding, ['column' => 6, 'row' => 1], [], [$bridge], $levels, $land)['id'] ?? null) === 'bridge', 'A walker level with the bridge it overlaps is carried along it');
deckCheck((FloorSupport::walkContact($onLanding, ['column' => 8, 'row' => 1], [['column' => 4, 'row' => 1]], [$bridge], $levels, $land)['id'] ?? null) === 'bridge', 'Through a waypoint too');
deckCheck(FloorSupport::walkContact([...$onLanding, 'column' => 3, '_supportSurfaceId' => 'bridge'], ['column' => 0, 'row' => 1], [], [$bridge], $levels, $land) === null, 'Walking back onto the land leaves the bridge');
deckCheck(FloorSupport::walkContact($onLanding, ['column' => 6, 'row' => 1], [], [$bridge], $levels, fn($p) => $p['column'] < 2.5 ? 2.2 : 0.0) === null, 'A real step down is not bridged');
deckCheck(FloorSupport::walkContact($onLanding, ['column' => 6, 'row' => 1], [], [$bridge], $levels, fn($p) => $p['column'] < 2.5 ? 1.8 : 0.0) === null, 'A real step up is not bridged');
deckCheck(FloorSupport::walkContact(['column' => 5, 'row' => 1, 'width' => 1, 'height' => 1, 'levelId' => 'level-0'], ['column' => 7, 'row' => 1], [], [$bridge], $levels, fn($p) => 0.0) === null, 'A walker under the bridge is never lifted onto it');
deckCheck(FloorSupport::walkContact([...$onLanding, 'movementMode' => 'fly', 'flightHeight' => 2.0], ['column' => 6, 'row' => 1], [], [$bridge], $levels, $land) === null, 'A flier is not put on it');
echo "A walker level with a deck it overlaps is on it; steps, underpasses and fliers are unchanged.\n";
