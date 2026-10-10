<?php
declare(strict_types=1);
// A stair of plain ground that climbs to a walkway plate, with the numbers of the stone stair on
// Dead Root (squares 45,22 up to the walkway from 45,18), laid along x here: the walkway is the
// plate over columns 0 to 4, the stair's landing is level with it (2.00) for 0.7 of a square past
// the plate's end, the stair then falls to the ground over 2.3 squares, and the ground under the
// walkway is 0. Brandon, Build 458: "moving up the stairs to sometimes fall through".
//  - One drag from the walkway down the stair was ruled a fall of 2 (leaving a plate for no plate
//    was measured from the plate to wherever the move ended).
//  - A size 2 walker dragged up the stair missed the walkway (its centre was still on the slope, a
//    quarter of a square below the plate, and the rule allowed a tenth) and ended under it.
// stair-meets-walkway in floor-support.test.mjs walks the same shapes in the browser's copy.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function stairCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

/** Straight line between the listed [x, height] points, flat beyond the ends. */
function stairProfile(array $points): callable {
    return static function (float $x) use ($points): float {
        if ($x <= $points[0][0]) return (float) $points[0][1];
        for ($i = 1; $i < count($points); $i++) {
            [$x0, $z0] = $points[$i - 1]; [$x1, $z1] = $points[$i];
            if ($x <= $x1) return $z0 + ($z1 - $z0) * ($x - $x0) / ($x1 - $x0);
        }
        return (float) $points[count($points) - 1][1];
    };
}
$walkway = ['id'=>'walkway', 'kind'=>'floor', 'levelId'=>'up', 'height'=>2.0, 'points'=>[['x'=>0, 'y'=>1], ['x'=>5, 'y'=>1], ['x'=>5, 'y'=>2], ['x'=>0, 'y'=>2]]];
$mapLevels = ['levels'=>[['id'=>'up', 'elevationSquares'=>2, 'cutouts'=>[]]]];
/** Ground whose height depends only on x (seven samples to the square, as the real map has), with the walkway over it. */
$config = static function (callable $height) use ($walkway, $mapLevels): array {
    $n = 7 * 12 + 1; $h = [];
    for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $h[] = (float) $height($i / 7);
    return ['mapLevels'=>$mapLevels, 'environment'=>['terrain'=>['revision'=>1, 'value'=>['n'=>$n, 'm'=>2, 'h'=>$h, 'bounds'=>['left'=>0, 'top'=>0, 'width'=>12, 'height'=>4]]], 'walls'=>['revision'=>1, 'value'=>['nodes'=>[], 'segments'=>[], 'roofs'=>[$walkway], 'ramps'=>[]]]]];
};
// The real stair: 0 under the walkway, up the face to 2.00 at the plate's end, level for 0.7, then down to the foot.
$stair = stairProfile([[4.857, 0], [5.0, 2.0], [5.7, 2.0], [8.0, 0.0]]);
$onWalkway = static fn (float $column, float $row = 1) => ['id'=>'t', 'column'=>$column, 'row'=>$row, 'width'=>1, 'height'=>1, 'levelId'=>'up', '_supportSurfaceId'=>'walkway', 'movementMode'=>'ground'];
$onGround = static fn (float $column, float $row = 1, int $size = 1) => ['id'=>'t', 'column'=>$column, 'row'=>$row, 'width'=>$size, 'height'=>$size, 'levelId'=>'level-0', 'movementMode'=>'ground'];
$fall = static function (callable $shape, array $from, array $to, string $kind = 'walk', array $path = [], ?string $cause = null) use ($config): ?int {
    $plan = FallOutcome::plan($from, $to, $config($shape), $kind, $path, $cause);
    return $plan === null ? null : $plan['squares'];
};

// 1. Down the stair from the walkway.
stairCheck($fall($stair, $onWalkway(2), $onGround(8)) === null, 'One drag from the walkway down the stair to its foot is not a fall');
stairCheck($fall($stair, $onWalkway(2), $onGround(8), 'walk', [], 'fall') === null, 'Nor when the floor change itself is recorded as leaving the upper floor');
stairCheck($fall($stair, $onWalkway(2), $onGround(9), 'walk', [['column'=>2, 'row'=>1], ['column'=>5, 'row'=>1], ['column'=>9, 'row'=>1]]) === null, 'Nor along the ruler\'s points, past the foot');
stairCheck($fall($stair, $onWalkway(4), $onGround(5)) === null, 'One square off the plate onto the landing is not a fall (it never was)');
stairCheck($fall($stair, $onWalkway(2), $onGround(7), 'forced') === null, 'Shoved down the stair, a creature goes down the stair');

// 2. Real edges still drop.
stairCheck($fall($stair, $onWalkway(2), $onGround(2, 2)) === 2, 'Walking off the side of the walkway is a fall of 2');
stairCheck($fall($stair, $onWalkway(2), $onGround(2, 3), 'walk', [['column'=>2, 'row'=>1], ['column'=>2, 'row'=>2], ['column'=>2, 'row'=>3]]) === 2, 'And on along the ground after it, still a fall of 2');
stairCheck($fall($stair, $onWalkway(2), $onGround(2, 3), 'forced') === 2, 'Shoved off the side of the walkway, a creature falls 2');
$openEnd = static fn (float $x): float => 0.0;
stairCheck($fall($openEnd, $onWalkway(2), $onGround(6)) === 2, 'A walkway that ends over open air is a drop from its end');
stairCheck($fall($openEnd, $onWalkway(2), $onGround(6), 'forced') === 2, 'And a shoved creature leaves it and falls');
// A stair, ramp or vine walked from end to end changes the floor ("stairs"): that is not a fall, however high.
stairCheck($fall($openEnd, $onWalkway(2), $onGround(6), 'walk', [], 'stairs') === null, 'Down a vine to the ground in one move is not a fall');
// Level land at the plate's end, then a sheer drop two squares further on: a fall from the land, where the drop is.
$landThenCliff = stairProfile([[4.857, 0], [5.0, 2.0], [7.0, 2.0], [7.143, 0.0]]);
stairCheck($fall($landThenCliff, $onWalkway(2), $onGround(9)) === 2, 'Off the plate onto land and then over a cliff is a fall from the cliff');
stairCheck($fall($landThenCliff, $onWalkway(2), $onGround(6)) === null, 'Off the plate onto land, stopping short of the cliff, is no fall');
// Ground just under a square below the plate at its end is still a drop (a ledge of one square).
$ledge = stairProfile([[4.857, 0], [5.0, 1.0], [9.0, 1.0]]);
stairCheck($fall($ledge, $onWalkway(2), $onGround(6)) === 1, 'A one-square step down off the end of a plate is a fall of 1');

// 3. Up the stair onto the walkway.
$ground = static fn (callable $shape) => static fn (array $p): float => $shape($p['column'] + ($p['width'] ?? 1) / 2);
$contact = static function (callable $shape, array $from, array $to, array $path = []) use ($walkway, $mapLevels, $ground): ?string {
    return FloorSupport::walkContact($from, [...$from, ...$to], $path, [$walkway], $mapLevels, $ground($shape))['id'] ?? null;
};
stairCheck($contact($stair, $onGround(8), ['column'=>2, 'row'=>1]) === 'walkway', 'A size 1 walker dragged up the stair is on the walkway');
stairCheck($contact($stair, $onGround(8, 1, 2), ['column'=>2, 'row'=>1]) === 'walkway', 'A size 2 walker dragged up the stair is on the walkway (it used to end under it)');
stairCheck($contact($stair, $onGround(5, 1, 2), ['column'=>4, 'row'=>1]) === 'walkway', 'A size 2 walker stepping one square from the head of the stair is on the walkway');
// A stair with no landing at all, rising straight into the plate's edge at one square in one.
$noLanding = stairProfile([[4.857, 0], [5.0, 2.0], [7.0, 0.0]]);
stairCheck($contact($noLanding, $onGround(8), ['column'=>2, 'row'=>1]) === 'walkway', 'A stair with no landing still carries a walker onto the plate at its top');
// Under the walkway, on the ground two squares below it: never lifted onto it.
stairCheck($contact($stair, $onGround(1, 0), ['column'=>1, 'row'=>1]) === null, 'A walker on the ground that walks under the walkway stays under it');
stairCheck($contact($stair, $onGround(3), ['column'=>1, 'row'=>1]) === null, 'A walker already under the walkway stays under it');
// A plate six tenths of a square above the walker is not stepped onto.
$lowStair = stairProfile([[4.857, 0], [5.0, 1.4], [5.7, 1.4], [8.0, 0.0]]);
stairCheck($contact($lowStair, $onGround(5), ['column'=>4, 'row'=>1]) === null, 'A landing six tenths of a square below the plate is not its landing');

// 4. The whole move, as the server makes it: up, then down in one drag, on the real numbers.
$terrainAt = $ground($stair);
$up = FloorGeometry::move($onGround(8, 1, 2), ['column'=>2, 'row'=>1], $mapLevels, 'walk', [], [$walkway], $terrainAt);
stairCheck(($up['supportSurfaceId'] ?? null) === 'walkway' && $up['levelId'] === 'up', 'The move up puts a size 2 walker on the walkway, on the upper floor');
$down = FloorGeometry::move($onWalkway(2), ['column'=>8, 'row'=>1], $mapLevels, 'walk', [], [$walkway], $terrainAt);
stairCheck($down['levelId'] === 'level-0' && empty($down['supportSurfaceId']), 'The move down ends on the ground floor, on no plate');
echo "A stair of plain ground that meets a walkway: up onto it at any size, down it in one drag without a fall, and real edges still drop.\n";
