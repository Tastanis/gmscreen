<?php
declare(strict_types=1);
// A creature that leaves a plate or a ramp travels on at the height it started from, and falls
// when the move ends. What stands on the ground far below its path does not stop it; what reaches
// its own height does. Found on the islands map: pushes off an island 6 or 18 squares up were
// refused because a stone tooth or a crystal stood on the crater floor under them.
//
// The scene: a low island (6 high) over a flat floor, with a crater wall (18 high) to the west.
// On the floor, just off the island's south edge, a stone tooth: one square ringed by walls two
// squares tall. A vine one square long hangs from the island's east edge down to the floor.
// Every move goes through the real store. The browser's side is travel-height.test.mjs.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function overCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$ring = static fn ($l, $t, $r, $b) => [['x'=>$l,'y'=>$t],['x'=>$r,'y'=>$t],['x'=>$r,'y'=>$b],['x'=>$l,'y'=>$b]];
$box = static fn ($l, $t, $r, $b) => [['column'=>$l,'row'=>$t],['column'=>$r,'row'=>$t],['column'=>$r,'row'=>$b],['column'=>$l,'row'=>$b]];
$holes = static fn ($l, $t, $r, $b) => [
    ['column'=>0,'row'=>0,'width'=>40,'height'=>$t], ['column'=>0,'row'=>$b,'width'=>40,'height'=>30-$b],
    ['column'=>0,'row'=>$t,'width'=>$l,'height'=>$b-$t], ['column'=>$r,'row'=>$t,'width'=>40-$r,'height'=>$b-$t],
];
/** A square ringed by four walls, set in a little so it shares no line with its neighbours. */
$object = static function (string $id, int $column, int $row, float $base, float $height): array {
    $c = [[$column + .04, $row + .04], [$column + .96, $row + .04], [$column + .96, $row + .96], [$column + .04, $row + .96]];
    $nodes = []; $segments = [];
    foreach ($c as $k => [$x, $y]) $nodes[] = ['id'=>"$id-n$k", 'x'=>$x, 'y'=>$y];
    foreach ([0, 1, 2, 3] as $k) $segments[] = ['id'=>"$id-w$k", 'a'=>"$id-n$k", 'b'=>"$id-n" . (($k + 1) % 4), 'baseMode'=>'fixed', 'base'=>$base, 'height'=>$height, 'sight'=>'block', 'movement'=>'block'];
    return [$nodes, $segments];
};
// The island: columns 20 to 29, rows 10 to 19. Ground: 18 high west of column 8, 0 elsewhere.
[$toothNodes, $toothWalls] = $object('tooth', 24, 20, 0.0, 2.0);       // on the floor, under the path of a push south
[$pillarNodes, $pillarWalls] = $object('pillar', 27, 15, 6.0, 3.0);    // on the island itself
[$spireNodes, $spireWalls] = $object('spire', 21, 20, 0.0, 9.0);       // on the floor, but taller than the island
[$farNodes, $farWalls] = $object('far', 24, 26, 0.0, 2.0);             // on the floor, seven squares out from the island
$vine = ['id'=>'vine','corners'=>$box(30,14,31,15),'edgeColors'=>['30,14-30,15'=>'green','31,14-31,15'=>'red']];
$n = 8 * 40 + 1; $heights = [];
for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $heights[] = $i / 8 < 8 ? 18.0 : 0.0;
$scene = [
    'mapLevels'=>['activeLevelId'=>'level-0','baseStairs'=>[[...$vine,'direction'=>'up','linkedLevelId'=>'low']],
        'levels'=>[['id'=>'low','name'=>'Low','elevationSquares'=>6,'zIndex'=>1,'cutouts'=>$holes(20,10,30,20),'stairs'=>[[...$vine,'direction'=>'down','linkedLevelId'=>'level-0']]]]],
    'terrain'=>['n'=>$n,'m'=>2,'h'=>$heights,'bounds'=>['left'=>0,'top'=>0,'width'=>40,'height'=>30]],
    'walls'=>['version'=>1,'nodes'=>[...$toothNodes, ...$pillarNodes, ...$spireNodes, ...$farNodes],'segments'=>[...$toothWalls, ...$pillarWalls, ...$spireWalls, ...$farWalls],
        'roofs'=>[['id'=>'island','kind'=>'floor','levelId'=>'low','height'=>6.0,'points'=>$ring(20,10,30,20),'holes'=>[],'nodes'=>[],'floating'=>true]],
        'ramps'=>[['id'=>'vine','left'=>30,'right'=>31,'top'=>14,'bottom'=>15,'base'=>0.0,'height'=>6.0,'fromLevel'=>'level-0','toLevel'=>'low','direction'=>'west']]],
];
/**
 * Tokens on a fresh copy of the scene, then moves of the first one. A step is [column, row, kind];
 * kind 'push' lets the server work out where the push stops, as the board does; 'player' is a walk
 * by a player, who (unlike the GM) is stopped by walls. Returns per step
 * [column, row, floor, feet, fall or null, ids collided with] or the refusal's message.
 */
$run = static function (array $tokens, array $steps) use ($scene): array {
    $database = sys_get_temp_dir() . '/vtt-push-over-' . bin2hex(random_bytes(6)) . '.sqlite'; $rows = [];
    try {
        $store = new SyncV2Store($database);
        $placed = [];
        foreach ($tokens as $i => [$column, $row, $level]) $placed[] = ['id'=>$i === 0 ? 't' : "other$i",'name'=>"t$i",'team'=>'ally','column'=>$column,'row'=>$row,'width'=>1,'height'=>1,'levelId'=>$level];
        $board = ['placements'=>['scene'=>$placed], 'sceneState'=>['scene'=>['mapLevels'=>$scene['mapLevels']]]];
        $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
        foreach (['terrain', 'walls'] as $field) { $snap = $store->getSnapshot();
            $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>"over-env-$field",'sceneId'=>'scene','baseRevision'=>$snap['revision'],
                'entityRevision'=>$snap['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>$field,'expectedRevision'=>0,'value'=>$scene[$field]]], 'gm', true); }
        $effects = new CollisionEffects(new PDO('sqlite:' . $database), 'default');
        foreach ($steps as $k => [$column, $row, $kind]) {
            $snap = $store->getSnapshot(); $token = $snap['state']['placements']['scene']['t']; $operation = 'over-' . str_pad((string) $k, 3, '0', STR_PAD_LEFT);
            $payload = ['column'=>$column,'row'=>$row,'movementKind'=>$kind === 'player' ? 'walk' : ($kind === 'push' ? 'forced' : $kind)];
            if ($kind === 'push') { $plan = ForcedMovement::resolve($token, ['column'=>$column,'row'=>$row], $snap['state']['placements']['scene'], $snap['state']['sceneConfig']['scene']);
                $payload = ['column'=>$plan['column'],'row'=>$plan['row'],'movementKind'=>'forced','forcedDestination'=>['column'=>$column,'row'=>$row]]; }
            try { $store->acceptTokenMove(['type'=>'token.move','operationId'=>$operation,'sceneId'=>'scene','entityId'=>'t','baseRevision'=>$snap['revision'],
                'entityRevision'=>$token['_entityRevision'] ?? 0,'payload'=>$payload], $kind === 'player' ? 'cal' : 'gm', $kind !== 'player'); }
            catch (InvalidArgumentException $error) { $rows[] = $error->getMessage(); continue; }
            $snap = $store->getSnapshot(); $after = $snap['state']['placements']['scene']['t']; $fall = null; $hit = [];
            foreach ($effects->list('gm', true, $operation) as $effect) { if (isset($effect['details']['squares'])) $fall = $effect['details']['squares']; else $hit[] = $effect['targetId']; }
            $rows[] = [(float) $after['column'], (float) $after['row'], $after['levelId'], round(WallMovement::height($after, $snap['state']['sceneConfig']['scene']), 2), $fall, $hit];
        }
        unset($store, $effects);
    } finally { @unlink($database); }
    return $rows;
};
$last = static fn (array $rows) => $rows[count($rows) - 1];
$is = static function ($row, $expected, string $message): void { overCheck($row == $expected, $message . ': ' . json_encode($row) . ', expected ' . json_encode($expected)); };

// ---- over a thing on the floor --------------------------------------------
// The island's south edge is row 19. The tooth is on the floor at (24,20), two squares tall.
foreach ([1, 2, 3] as $squares) {
    $rows = $run([[24, 18, 'low']], [[24, 19, 'walk'], [24, 19 + $squares, 'forced']]);
    $is($last($rows), [24.0, 19.0 + $squares, 'level-0', 0.0, 6, []], "Pushed $squares off the island over the tooth: it goes its whole distance and falls 6");
}
$is($last($run([[24, 17, 'low']], [[24, 18, 'walk'], [24, 21, 'push']])), [24.0, 21.0, 'level-0', 0.0, 6, []], 'With the app working out the stop: nothing on the floor stops it');
// However long the push: a second tooth stands on the floor seven squares out from the island, and
// a creature two squares beyond it. A creature that has left the island does not come back down to
// the ground part-way through the move, so neither is in its way.
$is($last($run([[24, 18, 'low']], [[24, 19, 'walk'], [24, 29, 'forced']])), [24.0, 29.0, 'level-0', 0.0, 6, []], 'Pushed 10 off the island: over both teeth, a fall of 6');
$is($last($run([[24, 18, 'low'], [24, 28, 'level-0']], [[24, 19, 'walk'], [24, 29, 'push']])), [24.0, 29.0, 'level-0', 0.0, 6, []], 'With the app working out the stop, and a creature on the floor far out: the same');
// A creature standing on the floor under the path is not hit either.
$is($last($run([[24, 18, 'low'], [24, 21, 'level-0']], [[24, 19, 'walk'], [24, 22, 'push']])), [24.0, 22.0, 'level-0', 0.0, 6, []], 'A creature on the floor under a push 6 squares up is not in its way');
// A player who walks off the edge takes that step at the island's height, then falls.
$is($last($run([[24, 18, 'low']], [[24, 19, 'walk'], [24, 20, 'player']])), [24.0, 20.0, 'level-0', 0.0, 6, []], 'A walk off the edge over the tooth is made, and is a fall of 6');
echo "PASS a creature that leaves a plate passes over what stands on the floor below\n";

// ---- what really is in the way still stops it --------------------------------
// On the floor, the tooth is a wall: a push into it stops short and a player cannot walk into it.
$rows = $run([[24, 22, 'level-0']], [[24, 21, 'walk'], [24, 20, 'push']]);
overCheck($last($rows)[0] === 24.0 && $last($rows)[1] === 21.0, 'A creature on the floor pushed into the tooth is stopped by it: ' . json_encode($last($rows)));
$is($last($run([[24, 22, 'level-0']], [[24, 21, 'walk'], [24, 20, 'player']])), 'Movement blocked by a wall or closed door/window.', 'A player on the floor cannot walk into the tooth');
// On the island, the pillar at (27,15) stands at the creature's own height.
$rows = $run([[24, 15, 'low']], [[25, 15, 'walk'], [28, 15, 'push']]);
overCheck($last($rows)[0] === 26.0 && $last($rows)[2] === 'low' && $last($rows)[4] === null, 'A push along the island into the pillar stops at the pillar: ' . json_encode($last($rows)));
// A spire on the floor that is taller than the island is in the way of a push off the island.
$rows = $run([[21, 18, 'low']], [[21, 19, 'walk'], [21, 22, 'push']]);
overCheck($last($rows)[1] === 19.0 && $last($rows)[2] === 'low', 'A push off the island into a spire that rises past the island is stopped: ' . json_encode($last($rows)));
// A creature at the island's own height in the path is still hit.
$rows = $run([[24, 14, 'low'], [26, 14, 'low']], [[24, 14, 'walk'], [28, 14, 'push']]);
overCheck($last($rows)[0] === 25.0 && in_array('other1', $last($rows)[5], true), 'A creature on the island in the path is collided with: ' . json_encode($last($rows)));
echo "PASS what reaches the mover's own height still stops it\n";

// ---- pushed off the island at a cliff --------------------------------------------
// The crater wall is 18 high from column 8 westward. A creature pushed west off the island (6 high)
// crosses the open floor in the air and hits the wall: it stops against it and falls from there.
$rows = $run([[22, 12, 'low']], [[21, 12, 'walk'], [3, 12, 'push']]);
overCheck($last($rows)[2] === 'level-0' && $last($rows)[0] >= 8.0 && $last($rows)[0] <= 9.0 && $last($rows)[4] === 6, 'Pushed at the crater wall, it stops at the wall and falls to the floor: ' . json_encode($last($rows)));
// On the floor, a push at the same wall stops in the same place, as it always did.
$rows = $run([[14, 12, 'level-0']], [[13, 12, 'walk'], [3, 12, 'push']]);
overCheck($last($rows)[0] >= 8.0 && $last($rows)[0] <= 9.0, 'From the floor, the wall stops a push as before: ' . json_encode($last($rows)));
$config = ['mapLevels'=>$scene['mapLevels'],'environment'=>['terrain'=>['value'=>$scene['terrain']],'walls'=>['value'=>$scene['walls']]]];
$onIsland = ['column'=>20,'row'=>12,'width'=>1,'height'=>1,'levelId'=>'low'];
overCheck((new TravelPath($onIsland, $config))->slams(['column'=>3,'row'=>12]), 'Ground standing over a creature in the air is a slam');
overCheck(!(new TravelPath($onIsland, $config))->slams(['column'=>9,'row'=>12]), 'Short of the wall it is not');
overCheck(!(new TravelPath([...$onIsland,'column'=>24,'row'=>19], $config))->slams(['column'=>24,'row'=>29]), 'Open floor below is not');
// One path answers for every point on its line, in any order, and for another line after it.
$path = new TravelPath($onIsland, $config);
foreach ([[8, 6.0], [19.5, 6.0], [14, 6.0], [19.9, 6.0], [20, 6.0]] as [$column, $z]) overCheck($path->heightAt(['column'=>$column,'row'=>12], true) === $z, "Off the island's west edge the mover is still $z up at column $column");
overCheck($path->heightAt(['column'=>24,'row'=>12], true) === 6.0 && $path->heightAt(['column'=>20,'row'=>4], true) === 6.0, 'Along the island, and off its north edge');
echo "PASS a creature in the air is stopped by ground that stands above it\n";

// ---- a vine that reaches the floor never catches a shoved creature -------------------
// The vine is the square (30,14), east of the island, from the floor (0) up to the island (6).
$is($last($run([[28, 14, 'low']], [[29, 14, 'walk'], [30, 14, 'forced']])), [30.0, 14.0, 'level-0', 0.0, 6, []], 'Shoved into the vine\'s square, a creature falls the whole 6 to the floor, not 3 to the middle of the vine');
$is($last($run([[28, 14, 'low']], [[29, 14, 'walk'], [31, 14, 'forced']])), [31.0, 14.0, 'level-0', 0.0, 6, []], 'Shoved past it, the same');
// A creature standing on the floor in the vine's square, which never climbed it, is on the floor.
$floor = ['mapLevels'=>$scene['mapLevels'],'environment'=>['terrain'=>['value'=>$scene['terrain']],'walls'=>['value'=>$scene['walls']]]];
overCheck(WallMovement::height(['column'=>30,'row'=>14,'width'=>1,'height'=>1,'levelId'=>'level-0'], $floor) === 0.0, 'A creature under a vine is on the ground');
overCheck(WallMovement::height(['column'=>30,'row'=>14,'width'=>1,'height'=>1,'levelId'=>'level-0','_floorTraversal'=>['stairId'=>'vine','entry'=>'red']], $floor) === 3.0, 'One that is climbing it is half-way up');
// Walking it is unchanged: a route both ways, with no fall.
$rows = $run([[32, 14, 'level-0']], [[31, 14, 'walk'], [30, 14, 'walk'], [29, 14, 'walk']]);
$is($rows[1], [30.0, 14.0, 'level-0', 3.0, null, []], 'Climbing the vine from the floor');
$is($rows[2], [29.0, 14.0, 'low', 6.0, null, []], 'and off its head onto the island');
$rows = $run([[28, 14, 'low']], [[29, 14, 'walk'], [30, 14, 'walk'], [31, 14, 'walk']]);
$is($rows[1], [30.0, 14.0, 'low', 3.0, null, []], 'Climbing down it from the island');
$is($rows[2], [31.0, 14.0, 'level-0', 0.0, null, []], 'and off its foot onto the floor');
// A stair that is a slope keeps the old allowance: a creature at its foot with no record is on it.
$stairs = $floor; $stairs['environment']['walls']['value']['ramps'] = [['id'=>'steps','left'=>30,'right'=>34,'top'=>14,'bottom'=>15,'base'=>0.0,'height'=>4.0,'fromLevel'=>'level-0','toLevel'=>'low','direction'=>'west']];
overCheck(WallMovement::height(['column'=>33,'row'=>14,'width'=>1,'height'=>1,'levelId'=>'level-0'], $stairs) === 0.5, 'A creature on the bottom step of a stair is on the stair');
echo "PASS a vine carries climbers and never catches a shoved creature\n";

// ---- the rule itself ------------------------------------------------------------------
// [height, in the air] after a step of so many squares onto footing at a given height.
overCheck(TravelPath::step(6, false, 0, .125) === [6.0, true], 'Six squares of drop in one step: off its footing, still 6 up');
overCheck(TravelPath::step(6, true, 0, .125) === [6.0, true] && TravelPath::step(6, true, 2, .125) === [6.0, true], 'In the air it stays level over whatever is below');
overCheck(TravelPath::step(6, true, 6, .125) === [6.0, false] && TravelPath::step(6, true, 6.5, .125) === [6.5, false], 'Ground that comes back up to it is footing again');
overCheck(TravelPath::step(6, false, 5.85, .125) === [5.85, false] && TravelPath::step(6, false, 6.4, .125) === [6.4, false], 'A slope down or up: still on it');
overCheck(TravelPath::step(6, false, 5.7, .125) === [6.0, true], 'Steeper than a slope: off it');
overCheck(TravelPath::step(1, false, 0, .125) === [1.0, true] && TravelPath::step(1, false, 0, .125, 'walk') === [0.0, false], 'A one-square bank: a pushed creature leaves it; a walker steps down it');
overCheck(TravelPath::step(2, false, 0, .125, 'walk') === [2.0, true], 'A two-square drop: a walker has left its footing too');
echo "PASS when a mover has left its footing\n";
