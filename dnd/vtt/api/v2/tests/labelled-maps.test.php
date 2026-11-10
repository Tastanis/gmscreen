<?php
declare(strict_types=1);
// Labelled maps (Brandon, November 8, 2026: "The AI map maker labels everything ... The code reads the labels and acts
// on them"). An object is stored once and gets its walls built; a stair is its ramp; the load check warns, never
// blocks; players never learn what breaks. The browser's side is in labelled-maps.test.mjs.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function labelCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$valid = function (array $model): bool { try { SceneEnvironment::validate('walls', $model); return true; } catch (InvalidArgumentException $e) { return false; } };
$square = fn (float $x, float $y, float $size = 1.) => [['x'=>$x,'y'=>$y],['x'=>$x+$size,'y'=>$y],['x'=>$x+$size,'y'=>$y+$size],['x'=>$x,'y'=>$y+$size]];
$design = fn (array $objects, array $extra = []) => ['version'=>1,'labels'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[],'objects'=>$objects, ...$extra];

// ---- the rules table is one file for both sides
labelCheck(MovementRules::get('stepUp') === 1.5 && MovementRules::get('climbGrade') === 2. && MovementRules::get('deckSnap') === .5 && MovementRules::get('detourLimit') === 2., 'The rules table gives Brandon\'s numbers');
labelCheck(MovementRules::cost('enemy') === 1. && MovementRules::cost('water') === 1., 'The costs are in the table');
// The numbers the rules still use by name are the table's rows (one table: change it there and here together).
foreach ([[WallMovement::LOW_BARRIER,'stepUp'],[FloorSupport::BOX_REACH,'stepUp'],[WallBoxes::BOX_HEIGHT,'stepUp'],[FloorSupport::PLATE_REACH,'deckSnap'],[FloorSupport::BOX_FOOT,'boxFoot'],[WallMovement::BOX_FOOT,'boxFoot'],[FloorSupport::GROUND_CLEARANCE,'groundClearance'],[WallMovement::BODY,'bodyHeight'],[FloorSupport::CLIMB_FOOT,'bodyHeight'],[TerrainContact::GRADE,'climbGrade']] as [$value,$row]) labelCheck(abs($value - MovementRules::get($row)) < 1e-9, "A named number matches the table's $row");
echo "PASS the rules table is read from the browser's own file\n";

// ---- objects: one record, walls built from it
$crate = ['id'=>'crate-1','kind'=>'crate','label'=>'Crate by the door','points'=>$square(5, 2),'base'=>0,'top'=>1,'standOn'=>true,'climbable'=>true,'material'=>'wood','group'=>'crate-1'];
$arch = ['id'=>'arch-leg','kind'=>'tree','points'=>[['x'=>8,'y'=>2],['x'=>10,'y'=>2],['x'=>9,'y'=>4]],'base'=>0,'top'=>6,'standOn'=>false];
labelCheck($valid($design([$crate, $arch])), 'A labelled design with objects is accepted');
labelCheck(!$valid($design([[...$crate, 'points'=>[['x'=>1,'y'=>1],['x'=>2,'y'=>2]]]])), 'An object needs at least three points');
labelCheck(!$valid($design([[...$crate, 'shape'=>'round']])), 'Unknown object fields are refused');
labelCheck(!$valid($design([[...$crate, 'group'=>'g', 'material'=>null]])), 'A group needs a material');
labelCheck(!$valid($design([$crate, $crate])), 'Object ids are unique');
labelCheck(!$valid(['version'=>1,'labels'=>2,'nodes'=>[],'segments'=>[]]), 'Only labels version 1');
$built = MapLabels::expand($design([$crate, $arch]));
$crateWalls = array_values(array_filter($built['segments'], fn ($e) => ($e['object'] ?? null) === 'crate-1'));
$archWalls = array_values(array_filter($built['segments'], fn ($e) => ($e['object'] ?? null) === 'arch-leg'));
labelCheck(count($crateWalls) === 4 && count($archWalls) === 3 && count($built['nodes']) === 7, 'Each object gets one wall a side');
labelCheck($crateWalls[0]['id'] === 'obj:crate-1:0' && $crateWalls[0]['height'] === 1. && $crateWalls[0]['baseMode'] === 'fixed' && $crateWalls[0]['climbable'] === true && $crateWalls[0]['material'] === 'wood' && $crateWalls[0]['group'] === 'crate-1' && $crateWalls[0]['label'] === 'Crate by the door', 'An object\'s walls carry its settings');
labelCheck($crateWalls[0]['sight'] === 'pass' && $archWalls[0]['sight'] === 'block', 'Sight passes over a low object and is stopped by a tall one, unless the object says');
labelCheck($valid($built), 'The built walls are a valid design');
$again = MapLabels::expand($built);
labelCheck($again === $built, 'Building again changes nothing');
$broken = $built; foreach ($broken['segments'] as $i => $e) if ($e['id'] === 'obj:crate-1:2') { $broken['segments'][$i]['broken'] = true; $broken['segments'][$i]['rubble'] = 'wood'; }
$rebuilt = MapLabels::expand($broken);
$kept = array_values(array_filter($rebuilt['segments'], fn ($e) => $e['id'] === 'obj:crate-1:2'))[0];
labelCheck(($kept['broken'] ?? false) === true && ($kept['rubble'] ?? null) === 'wood', 'A broken wall stays broken when the walls are built again');
$moved = MapLabels::expand([...$built, 'objects'=>[[...$crate, 'points'=>$square(6, 2)]]]);
labelCheck(count($moved['segments']) === 4 && abs(array_column($moved['nodes'], 'x', 'id')['obj:crate-1:p0'] - 6) < 1e-9, 'Moving or removing an object moves or removes its walls');
$plain = ['version'=>1,'nodes'=>[['id'=>'a','x'=>0,'y'=>0],['id'=>'b','x'=>1,'y'=>0]],'segments'=>[['id'=>'w','a'=>'a','b'=>'b']]];
labelCheck(MapLabels::expand($plain) === $plain, 'A map with no objects is untouched');
echo "PASS an object is stored once and its walls are built from it\n";

// ---- base from the ground when not given
$terrain = ['n'=>11,'m'=>11,'h'=>array_map(fn ($i) => (float) ($i % 11) * .25, range(0, 120)),'bounds'=>['left'=>0,'top'=>0,'width'=>10,'height'=>10]];
$config = ['environment'=>['terrain'=>['revision'=>1,'value'=>$terrain]],'mapLevels'=>[]];
$rock = ['id'=>'rock','points'=>$square(4, 4, 2),'top'=>3];
labelCheck(abs(MapLabels::base($rock, $config) - 1.0) < 1e-6, 'A rock on a slope stands on the lowest ground under it');
labelCheck(MapLabels::base([...$rock, 'base'=>2], $config) === 2., 'A given base wins');
echo "PASS an object with no base stands on the lowest ground under it\n";

// ---- box tops from standOn objects only, at their own outline
$boxes = WallBoxes::boxes($built);
labelCheck(count($boxes) === 1 && $boxes[0]['id'] === 'box-top:obj:crate-1' && $boxes[0]['height'] === 1. && !empty($boxes[0]['climbable']), 'Only the standOn object is stood on');
$withTops = WallBoxes::with($built);
$top = array_values(array_filter($withTops['roofs'], fn ($r) => !empty($r['boxTop'])))[0];
labelCheck($top['points'] === array_map(fn ($p) => ['x'=>(float) $p['x'],'y'=>(float) $p['y']], $crate['points']) && $top['kind'] === 'floor', 'Its top is its own outline');
$tri = MapLabels::expand($design([[...$arch, 'standOn'=>true, 'top'=>2]]));
$triTop = WallBoxes::boxes($tri)[0];
labelCheck(count($triTop['points']) === 3, 'Any outline can be stood on, not only a square');
labelCheck(WallBoxes::boxes(MapLabels::expand($broken)) === [], 'A box with a broken wall is not stood on');
$guess = ['version'=>1,'labels'=>1,'nodes'=>[['id'=>'n1','x'=>1,'y'=>1],['id'=>'n2','x'=>2,'y'=>1],['id'=>'n3','x'=>2,'y'=>2],['id'=>'n4','x'=>1,'y'=>2]],
    'segments'=>array_map(fn ($i) => ['id'=>"s$i",'a'=>'n'.($i+1),'b'=>'n'.(($i+1)%4+1),'baseMode'=>'fixed','base'=>0,'height'=>1], range(0, 3))];
labelCheck(WallBoxes::boxes($guess) === [] && count(WallBoxes::boxes([...$guess, 'labels'=>null])) === 1, 'On a labelled map four walls in a square are not guessed to be a box; on an old map they still are');
echo "PASS box tops come from objects marked standOn, never from guessing\n";

// ---- stairs come from the ramp
$levels = ['levels'=>[['id'=>'up','elevationSquares'=>2,'stairs'=>[['id'=>'old','direction'=>'up','corners'=>[],'edgeColors'=>[]]]]],'baseStairs'=>[['id'=>'stale']]];
$ramp = ['id'=>'stair-1','left'=>16,'right'=>17,'top'=>10,'bottom'=>13,'base'=>0,'height'=>2,'fromLevel'=>'level-0','toLevel'=>'up','direction'=>'north'];
$linked = MapLabels::stairs([$ramp], $levels);
labelCheck(count($linked['baseStairs']) === 1 && count($linked['levels'][0]['stairs']) === 1, 'One stair each end, the old records replaced');
$foot = $linked['baseStairs'][0]; $head = $linked['levels'][0]['stairs'][0];
labelCheck($foot['id'] === 'stair-1' && $foot['direction'] === 'up' && $foot['linkedLevelId'] === 'up' && $head['direction'] === 'down' && $head['linkedLevelId'] === 'level-0', 'Up on the floor it starts from, down on the floor it reaches');
labelCheck($foot['edgeColors'] === ['16,10-17,10'=>'green','16,13-17,13'=>'red'] && $foot['corners'] === [['column'=>16,'row'=>10],['column'=>17,'row'=>10],['column'=>17,'row'=>13],['column'=>16,'row'=>13]], 'The same corners and colours the map maker used to write by hand');
$wide = MapLabels::stairOf([...$ramp, 'left'=>14, 'direction'=>'east']);
labelCheck(count(array_filter($wide['edgeColors'], fn ($c) => $c === 'green')) === 3 && count(array_filter($wide['edgeColors'], fn ($c) => $c === 'red')) === 3, 'An east stair three squares wide has three head and three foot edges');
labelCheck(MapLabels::stairOf([...$ramp, 'toLevel'=>'level-0']) === null, 'A slope on one floor is no floor link');
echo "PASS a stair is its ramp; the floor link is worked out from it\n";

// ---- the load check
$scene = ['mapLevels'=>['levels'=>[['id'=>'up','elevationSquares'=>2]]],'environment'=>[
    'terrain'=>['revision'=>1,'value'=>['n'=>9,'m'=>9,'h'=>array_map(fn ($i) => $i % 9 >= 4 ? 1.7 : 0., range(0, 80)),'bounds'=>['left'=>0,'top'=>0,'width'=>4,'height'=>4]]],
    'walls'=>['revision'=>1,'value'=>MapLabels::expand([...$design([$crate, [...$crate, 'id'=>'crate-2', 'points'=>$square(5.5, 2.5), 'group'=>'crate-2']]),
        'roofs'=>[['id'=>'ceiling','kind'=>'roof','levelId'=>'level-0','height'=>1.5,'points'=>$square(4, 1, 3)],['id'=>'deck','kind'=>'floor','levelId'=>'level-0','height'=>3,'points'=>$square(20, 20, 2)],['id'=>'odd','height'=>3,'points'=>$square(30, 30)]],
        'ramps'=>[[...$ramp, 'fromLevel'=>'level-0','toLevel'=>'up']]])],
    'zones'=>['revision'=>1,'value'=>['version'=>1,'zones'=>[['id'=>'z','tag'=>'water','kind'=>'water','squares'=>[[20,20]]]]]]]];
$lines = MapLabels::check($scene);
$has = fn (string $words) => (bool) array_filter($lines, fn ($line) => str_contains($line, $words));
labelCheck($has('has a ceiling right above'), 'A climbable thing under a ceiling is listed');
labelCheck($has('overlap'), 'Overlapping objects are listed');
labelCheck($has('Deck deck is 1.3 above the ground'), 'A deck that misses the ground is listed');
labelCheck($has('Water at (20,20) is under deck deck'), 'Water under a deck is listed');
labelCheck($has('neither floor nor roof'), 'A plate that says neither floor nor roof is listed');
labelCheck($has('ground bump'), 'Unlabelled bumps that will ask to climb are listed');
labelCheck($has('Ramp stair-1 foot'), 'A ramp end that meets no floor is listed');
echo "PASS the load check lists what will behave oddly\n";

// ---- players: never what breaks, never the check
$seen = SceneEnvironment::project(['walls'=>['revision'=>1,'value'=>[...$built, 'checks'=>['x']]]]);
labelCheck(!isset($seen['walls']['value']['objects'][0]['material']) && !isset($seen['walls']['value']['objects'][0]['group']) && isset($seen['walls']['value']['objects'][0]['standOn']) && !isset($seen['walls']['value']['checks']), 'A player sees an object\'s shape and top, not what breaks, and not the check');
echo "PASS players learn the shape of things, not what breaks\n";

// ---- import: a labelled package arrives with its walls, stairs and check
$package = ScenePackage::build(['id'=>'labelled','name'=>'Labelled','mapUrl'=>'/maps/base.jpg'], ['revision'=>4,'state'=>['sceneConfig'=>['labelled'=>[
    'mapLevels'=>['levels'=>[['id'=>'balcony','elevationSquares'=>2]]],
    'environment'=>['walls'=>['revision'=>1,'value'=>$design([
        ['id'=>'step-1','points'=>$square(3, 3),'base'=>0,'top'=>1,'standOn'=>true,'climbable'=>true],
        ['id'=>'urn','points'=>$square(16, 6),'top'=>3,'levelId'=>'balcony','standOn'=>false],
    ], ['roofs'=>[['id'=>'balcony-floor','kind'=>'floor','levelId'=>'balcony','height'=>2,'points'=>$square(14, 4, 6)]],
        'ramps'=>[['id'=>'stair-1','left'=>16,'right'=>17,'top'=>10,'bottom'=>13,'base'=>0,'height'=>2,'fromLevel'=>'level-0','toLevel'=>'balcony','direction'=>'north']]])]]]]]]);
$prepared = ScenePackage::prepareForNewScene($package, 'scn-labelled-import-1')['package'];
$walls = $prepared['domains']['sceneConfig']['environment']['walls']['value'];
$levels = $prepared['domains']['sceneConfig']['mapLevels'];
$upper = $levels['levels'][0]['id'];
labelCheck(count(array_filter($walls['segments'], fn ($e) => ($e['object'] ?? null) === 'step-1')) === 4, 'The imported object has its walls');
labelCheck($walls['objects'][1]['levelId'] === $upper, 'An object on an upper floor follows the floor\'s new id');
labelCheck(count($levels['baseStairs']) === 1 && $levels['baseStairs'][0]['linkedLevelId'] === $upper && $levels['baseStairs'][0]['id'] === $walls['ramps'][0]['id'] && $levels['levels'][0]['stairs'][0]['id'] === $walls['ramps'][0]['id'], 'The imported stair comes from its ramp and keeps the ramp\'s id');
labelCheck(is_array($walls['checks']), 'The load check is kept with the map');
SceneImportValidation::validate($package);
echo "PASS a labelled package is imported with its walls, stairs and check\n";

// ---- a walls save builds the walls afresh
$environment = ['walls'=>['revision'=>3,'value'=>$built]];
$saved = SceneEnvironment::apply($environment, ['field'=>'walls','expectedRevision'=>3,'value'=>[...$built, 'objects'=>[$crate]]]);
labelCheck(count($saved['walls']['value']['segments']) === 4, 'Saving the walls of a labelled map rebuilds its objects\' walls');
echo "PASS saving a labelled map rebuilds its objects' walls\n";

// ---- the two Thornbriar faults, through the store
// 1. A size 2 creature under an arch leg's span (an object off the ground) went nowhere: head room is a warning now.
// 2. A fall off a high step into a lower one landed on the ground inside the lower one: now on its top.
$thorn = $design([
    ['id'=>'high-step','points'=>$square(5, 2),'base'=>0,'top'=>4,'standOn'=>true,'climbable'=>true],
    ['id'=>'low-step','points'=>$square(6, 2),'base'=>0,'top'=>2,'standOn'=>true,'climbable'=>true],
    ['id'=>'arch-span','points'=>$square(10, 2, 2),'base'=>1.3,'top'=>3,'standOn'=>false],
]);
$db = sys_get_temp_dir().'/vtt-labelled-'.bin2hex(random_bytes(8)).'.sqlite';
try {
    $climber = ['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>5,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0','_supportSurfaceId'=>'box-top:obj:high-step'];
    $brute = ['id'=>'brute','name'=>'Brute','profileId'=>'cal','team'=>'ally','column'=>8,'row'=>2,'width'=>2,'height'=>2,'levelId'=>'level-0'];
    $store = new SyncV2Store($db); $board = ['placements'=>['scene'=>[$climber, $brute]],'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $s = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'labelled-environment','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$thorn]],'GM',true);
    $move = function (string $who, array $payload, string $id, bool $gm = false) use (&$store) { $s = $store->getSnapshot(); return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>$who,'baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene'][$who]['_entityRevision'],'payload'=>$payload], $gm ? 'GM' : 'cal', $gm); };
    $move('hero', ['column'=>6,'row'=>2,'movementKind'=>'walk'], 'labelled-off-high-step');
    $state = $store->getSnapshot()['state']; $hero = $state['placements']['scene']['hero'];
    $falls = array_values(array_filter($store->collisionEffects(['operationId'=>'labelled-off-high-step'],'GM',true), fn ($r) => $r['kind'] === 'fall'));
    labelCheck(($hero['_supportSurfaceId'] ?? null) === 'box-top:obj:low-step' && abs(WallMovement::height($hero, WallCubes::withTemplates($state['sceneConfig']['scene'], [])) - 2) < 1e-9, 'Off the high step he lands on the lower step\'s top');
    labelCheck(($falls[0]['details']['squares'] ?? null) === 2, 'and the fall is the two squares between them, not four to the ground');
    $move('brute', ['column'=>12,'row'=>2,'movementKind'=>'walk'], 'labelled-brute-under-arch');
    labelCheck($store->getSnapshot()['state']['placements']['scene']['brute']['column'] === 12, 'A size 2 creature walks under the arch\'s span');
} finally { unset($store); @unlink($db); }
echo "PASS Thornbriar: a fall lands on the step below; a big creature passes under the arch with a warning only\n";
