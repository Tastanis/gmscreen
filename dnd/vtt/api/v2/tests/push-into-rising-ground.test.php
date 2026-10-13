<?php
declare(strict_types=1);
// Found by the tester on Brandon's own Gravity Orchard, October 12, 2026: a creature on a platform 12 up, pushed 10
// west, ended standing 16.92 up on the crater wall, five squares HIGHER than it started, and no fall was offered.
//
// The push was rightly stopped by the wall: ground standing above a creature in the air stops it. But a stopped
// push is rounded to a whole square, and three quarters of the way into a square rounds up into it. The square it
// rounded into was the crater wall's own face. A push stopped by rising ground now ends in the last square whose
// footing is less than a face (one square) above the height the creature came in at, and it falls from there if
// there is a drop. A push stopped by a wall standing on level ground ends where it always did.
// The browser's side is in forced-drag.test.mjs.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function risingCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// Ground: a crater wall 18 high west of 5.4, falling to the crater floor (0) by 6.2; a platform 12 up over columns
// 8 to 21. So the square at column 5 is the wall's face: under its middle the ground is about 16, above the platform.
$n = 8 * 40 + 1; $heights = [];
for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) { $x = $i / 8; $heights[] = $x <= 5.4 ? 18.0 : ($x >= 6.2 ? 0.0 : 18.0 * (6.2 - $x) / 0.8); }
$ring = static fn ($l, $t, $r, $b) => [['x'=>$l,'y'=>$t],['x'=>$r,'y'=>$t],['x'=>$r,'y'=>$b],['x'=>$l,'y'=>$b]];
$scene = static fn (array $segments = [], array $nodes = []) => WallCubes::withTemplates([
    'mapLevels'=>['levels'=>[['id'=>'mid','elevationSquares'=>12,'cutouts'=>[]]]],
    'environment'=>[
        'terrain'=>['revision'=>1,'value'=>['n'=>$n,'m'=>2,'h'=>$heights,'bounds'=>['left'=>0,'top'=>0,'width'=>40,'height'=>30]]],
        'walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>$nodes,'segments'=>$segments,'roofs'=>[['id'=>'platform','kind'=>'floor','levelId'=>'mid','height'=>12.0,'points'=>$ring(8,10,21,20),'holes'=>[],'floating'=>true]]]],
    ],
], []);
$config = $scene();
$onPlatform = ['id'=>'pushed','column'=>14,'row'=>14,'width'=>1,'height'=>1,'levelId'=>'mid','_supportSurfaceId'=>'platform'];
$footing = static fn (array $from, float $column) => WallMovement::height([...$from, 'column'=>$column], $config);

// The face square really is a face: its footing is far above the platform, and the square east of it is the floor.
risingCheck($footing($onPlatform, 5) > 15 && $footing($onPlatform, 6) < 0.01, 'The scene: column 5 is the crater wall\'s face, column 6 its foot: ' . $footing($onPlatform, 5) . ', ' . $footing($onPlatform, 6));

$plan = ForcedMovement::resolve($onPlatform, [...$onPlatform, 'column'=>4], [], $config);
risingCheck($plan['wall'] === true, 'A push off the platform into the crater wall is stopped by it');
risingCheck($plan['column'] == 6 && $plan['row'] == 14, 'and ends at the wall\'s foot, not up on its face: ' . json_encode($plan));
risingCheck($footing($onPlatform, (float) $plan['column']) < 12, 'where the ground is below the height he was pushed at, so the fall is his');
risingCheck($plan['damage'] === 2 + 2, 'What was left of the push (two squares) is the slam, with the usual two for a solid thing: ' . $plan['damage']);
// However far the push was meant to go, it ends at the same foot.
foreach ([2, 1, 0] as $aim) risingCheck(ForcedMovement::resolve($onPlatform, [...$onPlatform, 'column'=>$aim], [], $config)['column'] == 6, "aimed at column $aim it still ends at the foot");
// A push that stops short of the wall is not touched.
$short = ForcedMovement::resolve($onPlatform, [...$onPlatform, 'column'=>7], [], $config);
risingCheck($short['column'] == 7 && $short['wall'] === false && $short['damage'] === 0, 'A push that ends over the crater floor short of the wall goes the whole way');

// On the crater floor, pushed at the same wall: he was never above it, and still ends at its foot.
$onFloor = ['id'=>'pushed','column'=>10,'row'=>25,'width'=>1,'height'=>1,'levelId'=>'level-0'];
$low = ForcedMovement::resolve($onFloor, [...$onFloor, 'column'=>3], [], $config);
risingCheck($low['wall'] === true && $low['column'] == 6, 'A creature on the floor pushed at the wall ends at its foot too: ' . json_encode($low));

// A wall piece on level ground: the push ends against it exactly as before (the square beside the wall).
$withWall = $scene([['id'=>'w','a'=>'a','b'=>'b','baseMode'=>'fixed','base'=>0.0,'height'=>3.0,'movement'=>'block']], [['id'=>'a','x'=>30,'y'=>20],['id'=>'b','x'=>30,'y'=>30]]);
$level = ForcedMovement::resolve($onFloor + ['row'=>25], [...$onFloor, 'column'=>35], [], $withWall);
risingCheck($level['wall'] === true && $level['column'] == 29, 'Against a wall on level ground he ends in the square beside it, as always: ' . json_encode($level));

// A gentle rise is not a face: a creature pushed up a slope of half a square a square ends where the push ends.
$gentle = [];
for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $gentle[] = max(0.0, 10 - $i / 8) * 0.5;
$slope = WallCubes::withTemplates(['mapLevels'=>['levels'=>[]],'environment'=>['terrain'=>['revision'=>1,'value'=>['n'=>$n,'m'=>2,'h'=>$gentle,'bounds'=>['left'=>0,'top'=>0,'width'=>40,'height'=>30]]],'walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[]]]]], []);
$up = ForcedMovement::resolve($onFloor, [...$onFloor, 'column'=>4], [], $slope);
risingCheck($up['wall'] === false && $up['column'] == 4, 'Pushed up a gentle slope he goes the whole way: ' . json_encode($up));

echo "push into rising ground: a stopped push ends at the foot of what stopped it, not part-way up it\n";
