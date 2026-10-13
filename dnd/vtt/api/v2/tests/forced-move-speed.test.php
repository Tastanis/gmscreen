<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Force moving over a long drop, like 20 squares down, is freezing. Its like its
// calculating all sorts of movement variations ... It usually works fine but on the gravity orchard map it froze
// the game pushing them from one platform over another."
//
// The rule was right and is not changed: a pushed creature goes in a straight line, travels on level once it has
// left its footing, and falls when the move ends. What froze was the working out. A push that is stopped is tried
// some thirty times to find where; every try read the footing at every place again (each reading walks the path
// from its start), worked out where the creature would stand after a leg that nothing followed, and wrote out
// and hashed every plate's outline at every eighth of a square. On the Orchard one stopped push took the server
// 4 to 16 seconds. These tests hold the answers still while that work is taken out.
// The browser's side is forced-move-speed.test.mjs.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function speedCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$ring = static fn ($l, $t, $r, $b) => [['x'=>$l,'y'=>$t],['x'=>$r,'y'=>$t],['x'=>$r,'y'=>$b],['x'=>$l,'y'=>$b]];
$object = static function (string $id, int $column, int $row, float $base, float $height): array {
    $c = [[$column + .04, $row + .04], [$column + .96, $row + .04], [$column + .96, $row + .96], [$column + .04, $row + .96]];
    $nodes = []; $segments = [];
    foreach ($c as $k => [$x, $y]) $nodes[] = ['id'=>"$id-n$k", 'x'=>$x, 'y'=>$y];
    foreach ([0, 1, 2, 3] as $k) $segments[] = ['id'=>"$id-w$k", 'a'=>"$id-n$k", 'b'=>"$id-n" . (($k + 1) % 4), 'baseMode'=>'fixed', 'base'=>$base, 'height'=>$height, 'sight'=>'block', 'movement'=>'block'];
    return [$nodes, $segments];
};
// Four islands over a pit, each on a floor of its own height with many cut-outs elsewhere on that floor; a rock on
// two of them, one on the pit's floor, a stump; a cliff 14 high east of column 24.
$cuts = [];
for ($k = 0; $k < 130; $k++) $cuts[] = ['column'=>25 + ($k * 7) % 14 + ($k % 3 === 0 ? .5 : 0), 'row'=>($k * 5) % 30, 'width'=>$k % 7 === 0 ? 2 : 1, 'height'=>$k % 11 === 0 ? 3 : 1];
$parts = [$object('rock-b', 13, 4, 12.0, 3.0), $object('rock-far', 20, 4, 13.0, 3.0), $object('stump', 5, 13, 6.0, 2.0), $object('floor-rock', 9, 5, 0.0, 2.0)];
$n = 8 * 40 + 1; $heights = [];
for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $heights[] = $i / 8 > 24 ? 14.0 : 0.0;
$config = WallCubes::withTemplates([
    'mapLevels'=>['levels'=>[['id'=>'low','elevationSquares'=>6,'cutouts'=>array_slice($cuts, 0, 60)], ['id'=>'mid','elevationSquares'=>12,'cutouts'=>array_slice($cuts, 60)]]],
    'environment'=>[
        'terrain'=>['revision'=>1,'value'=>['n'=>$n,'m'=>2,'h'=>$heights,'bounds'=>['left'=>0,'top'=>0,'width'=>40,'height'=>30]]],
        'walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>array_merge(...array_column($parts, 0)),'segments'=>array_merge(...array_column($parts, 1)),'roofs'=>[
            ['id'=>'a','kind'=>'floor','levelId'=>'mid','height'=>12.0,'points'=>$ring(2,2,8,8),'holes'=>[],'floating'=>true],
            ['id'=>'b','kind'=>'floor','levelId'=>'mid','height'=>12.0,'points'=>$ring(11,2,16,8),'holes'=>[],'floating'=>true],
            ['id'=>'c','kind'=>'floor','levelId'=>'low','height'=>6.0,'points'=>$ring(2,11,8,16),'holes'=>[],'floating'=>true],
            ['id'=>'d','kind'=>'floor','levelId'=>'mid','height'=>13.0,'points'=>$ring(18,3,22,7),'holes'=>[],'floating'=>true],
        ]]],
    ],
], []);

// The same push worked out the long way, as it was before: nothing kept from one try to the next (every try
// makes its own path), and the stopping square found from the tries exactly as ForcedMovement::resolve finds it.
$longWay = static function (array $from, array $to) use ($config): array {
    $dx = $to['column'] - $from['column']; $dy = $to['row'] - $from['row']; $distance = max(abs($dx), abs($dy));
    $at = fn ($t) => [...$from, 'column'=>$from['column'] + $dx * $t, 'row'=>$from['row'] + $dy * $t];
    $blocked = function ($point) use ($from, $config) { try { WallMovement::assertAllowed($from, $point, $config, 'forced', [], true, new TravelPath($from, $config, 'forced')); return false; } catch (InvalidArgumentException $e) { return true; } };
    $stop = 1.; $wall = false;
    if ($blocked($at($stop))) { $lo = 0.; $hi = $stop; for ($i = 0; $i < 32; $i++) { $mid = ($lo + $hi) / 2; if ($blocked($at($mid))) $hi = $mid; else $lo = $mid; } $stop = $lo; $wall = true; }
    if ($wall) { $travel = $distance * $stop; $whole = floor($travel + 1e-6); $steps = $whole + ($travel - $whole >= .75 - 1e-6 ? 1 : 0); $stop = min(1, $steps / $distance); }
    return ['column'=>$wall ? round($from['column'] + $dx * $stop) : $from['column'] + $dx * $stop, 'row'=>$wall ? round($from['row'] + $dy * $stop) : $from['row'] + $dy * $stop, 'damage'=>max(0, (int) ceil($distance * (1 - $stop) - 1e-6)) + ($wall ? 2 : 0), 'collidedIds'=>[], 'wall'=>$wall];
};
$starts = [['column'=>4,'row'=>4,'levelId'=>'mid','_supportSurfaceId'=>'a'], ['column'=>12,'row'=>5,'levelId'=>'mid','_supportSurfaceId'=>'b'], ['column'=>4,'row'=>12,'levelId'=>'low','_supportSurfaceId'=>'c'], ['column'=>6,'row'=>6,'levelId'=>'mid','_supportSurfaceId'=>'a']];
$stopped = 0; $plain = 0; $started = microtime(true);
foreach ($starts as $start) foreach ([3, 6, 10, 16, 22] as $distance) foreach ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [$ux, $uy]) {
    $from = ['id'=>'pushed','width'=>1,'height'=>1, ...$start]; $to = [...$from, 'column'=>$from['column'] + $ux * $distance, 'row'=>$from['row'] + $uy * $distance];
    if ($to['column'] < 0 || $to['row'] < 0) continue;
    $plan = ForcedMovement::resolve($from, $to, [], $config); $before = $longWay($from, $to);
    speedCheck($plan == $before, "from {$from['column']},{$from['row']} pushed $distance toward $ux,$uy: " . json_encode($plan) . ' but the long way gives ' . json_encode($before));
    $through = ForcedMovement::through($from, $to, [], $config);
    speedCheck($through['stopped'] == $plan && $through['column'] == $plan['column'] && $through['row'] == $plan['row'], 'the push that may break through walls plans the same stop when nothing here can break');
    $plan['wall'] ? $stopped++ : $plain++;
}
speedCheck($stopped >= 10 && $plain >= 10, "both kinds of push are in the set ($stopped stopped, $plain not)");

// A walk of several legs is still judged leg by leg from where the leg before left him: up onto the low island
// by its west side is no part of this, but a rock on island b stops the second leg of a walk across it.
$walker = ['id'=>'walker','column'=>12,'row'=>3,'width'=>1,'height'=>1,'levelId'=>'mid','_supportSurfaceId'=>'b'];
$refused = false;
try { WallMovement::assertAllowed($walker, [...$walker, 'column'=>14, 'row'=>4], $config, 'walk', [['column'=>12, 'row'=>4]], false); } catch (InvalidArgumentException $e) { $refused = true; }
speedCheck($refused, 'the second leg of a walk runs into the rock on the island');
WallMovement::assertAllowed($walker, [...$walker, 'column'=>12, 'row'=>6], $config, 'walk', [['column'=>12, 'row'=>4]], false);

// A plate's outline is known by its id only while it is the same outline: another shape under the same id is
// read afresh, both ways round.
$square = ['column'=>5,'row'=>5,'width'=>1,'height'=>1];
$wide = ['id'=>'same','kind'=>'floor','points'=>$ring(0,0,10,10),'holes'=>[]]; $narrow = ['id'=>'same','kind'=>'floor','points'=>$ring(0,0,3,3),'holes'=>[]];
$holed = ['id'=>'same','kind'=>'floor','points'=>$ring(0,0,10,10),'holes'=>[$ring(4,4,7,7)]];
foreach ([[$wide, true], [$narrow, false], [$wide, true], [$holed, false], [$wide, true], [$narrow, false]] as $k => [$surface, $expected]) {
    speedCheck(FloorSupport::intersects($square, $surface) === $expected, "outline $k under the one id is read as itself");
}
// And with cut-outs: the same plate, asked with and without, over and beside a cut-out.
speedCheck(FloorSupport::intersects($square, $wide, [['column'=>5,'row'=>5,'width'=>1,'height'=>1]]) === false, 'a cut-out over the whole square takes the floor from under it');
speedCheck(FloorSupport::intersects($square, $wide, [['column'=>7,'row'=>5,'width'=>1,'height'=>1]]) === true, 'a cut-out beside it does not');
speedCheck(FloorSupport::intersects($square, $wide) === true, 'and the plate is still itself afterwards');

printf("forced-move speed: %d stopped and %d plain pushes plan as they did, in %.1f s\n", $stopped, $plain, microtime(true) - $started);
