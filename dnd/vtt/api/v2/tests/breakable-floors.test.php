<?php
declare(strict_types=1);
// Breakable floor plates (plan part 4). Brandon, November 11, 2026, Dead Root: "all the breakable things to be breakable
// ... All of the bridges and stuff need this so that the floors of them can be broken"; November 12: "The bridge should
// be breakable. Basically every part of the floor, and if any one of the pillars breaks, that whole side should collapse."
// A floor plate with a material breaks one grid square at a time ("<plate>@<col>,<row>"); a broken square is a hole.
// A fall hard enough goes through; an object's `holds` squares break with it; creatures on a broken square drop.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function floorCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$square = fn (float $x, float $y, float $size = 1.) => [['x'=>$x,'y'=>$y],['x'=>$x+$size,'y'=>$y],['x'=>$x+$size,'y'=>$y+$size],['x'=>$x,'y'=>$y+$size]];
$deck = ['id'=>'deck','kind'=>'floor','levelId'=>'level-0','height'=>4.0,'material'=>'wood','points'=>[['x'=>2,'y'=>1],['x'=>8,'y'=>1],['x'=>8,'y'=>2],['x'=>2,'y'=>2]]];

// The squares of a plate, and holes where it is broken.
floorCheck(count(FloorSupport::plateSquares($deck)) === 6, 'The deck is six squares');
floorCheck(FloorSupport::squareOf('deck@5,1') === ['deck', 5, 1] && FloorSupport::squareOf('deck') === null, 'Square names');
$holed = FloorSupport::surfaces(['roofs'=>[[...$deck, 'broken'=>['4,1']]]])[0];
floorCheck(!FloorSupport::intersects(['column'=>4,'row'=>1], $holed) && FloorSupport::intersects(['column'=>3,'row'=>1], $holed), 'A broken square is a hole; the next one stands');
floorCheck(FloorSupport::intersects(['column'=>3.5,'row'=>1,'width'=>1,'height'=>1], $holed), 'A creature half over the hole is still on the deck');
echo "PASS a plate's squares, and a broken one is a hole\n";

// What a save may carry, and what a player is told.
$valid = fn (array $roof, array $objects = []) => SceneEnvironment::validate('walls', ['version'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[$roof],...($objects ? ['labels'=>1,'objects'=>$objects] : [])]);
$refused = function (callable $f, string $message) { try { $f(); } catch (InvalidArgumentException) { return; } throw new RuntimeException($message); };
$valid([...$deck, 'broken'=>['4,1']]);
$refused(fn () => $valid([...$deck, 'material'=>'cheese']), 'A made-up material is refused');
$refused(fn () => $valid([...$deck, 'kind'=>'roof']), 'A roof cannot be breakable');
$refused(fn () => $valid([...$deck, 'id'=>'deck@1']), 'A breakable plate id may not hold "@"');
$refused(fn () => $valid([...$deck, 'broken'=>['4,1','4,1']]), 'A square listed twice is refused');
$refused(fn () => $valid([...$deck, 'broken'=>['four']]), 'A broken square is "col,row"');
$refused(fn () => $valid(array_diff_key([...$deck, 'broken'=>['4,1']], ['material'=>1])), 'Only a breakable plate can be broken');
$valid($deck, [['id'=>'pillar','points'=>$square(6, 3),'top'=>4,'material'=>'stone','holds'=>[['roof'=>'deck','squares'=>['5,1','6,1']]]]]);
$refused(fn () => $valid($deck, [['id'=>'pillar','points'=>$square(6, 3),'top'=>4,'holds'=>[['roof'=>'deck','squares'=>['5,1']]]]]), 'Only a breakable object holds squares up');
$player = SceneEnvironment::project(['walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[[...$deck,'broken'=>['4,1']]],'objects'=>[['id'=>'pillar','points'=>$square(6, 3),'top'=>4,'material'=>'stone','holds'=>[['roof'=>'deck','squares'=>['5,1']]]]]]]]);
floorCheck(!isset($player['walls']['value']['roofs'][0]['material']) && $player['walls']['value']['roofs'][0]['broken'] === ['4,1'], 'A player keeps the holes, never the material');
floorCheck(!isset($player['walls']['value']['objects'][0]['holds']), 'nor what an object holds up');
echo "PASS what a save may carry, and what a player is told\n";

// Through the real store: a fall onto the deck, a pillar that takes its side of the bridge, and a creature dropping.
$map = ['version'=>1,'labels'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[$deck],'objects'=>[
    ['id'=>'roost','points'=>$square(1, 1),'base'=>0,'top'=>8,'standOn'=>true],
    ['id'=>'perch','points'=>$square(6, 4),'base'=>0,'top'=>11,'standOn'=>true],
    ['id'=>'pillar','points'=>$square(6, 3),'base'=>0,'top'=>4,'standOn'=>true,'material'=>'stone','holds'=>[['roof'=>'deck','squares'=>['5,1','6,1']]]],
]];
$db = sys_get_temp_dir().'/vtt-floor-break-'.bin2hex(random_bytes(8)).'.sqlite';
try {
    $hero = fn (string $id, int $c, int $r, ?string $on) => ['id'=>$id,'name'=>$id,'profileId'=>'cal','team'=>'ally','column'=>$c,'row'=>$r,'width'=>1,'height'=>1,'levelId'=>'level-0','_supportSurfaceId'=>$on];
    $store = new SyncV2Store($db);
    $board = ['placements'=>['scene'=>[$hero('a', 1, 1, 'box-top:obj:roost'), $hero('p', 6, 4, 'box-top:obj:perch'), $hero('b', 5, 1, 'deck')]],'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $s = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'floor-env','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$map]],'GM',true);
    $move = function (string $who, array $payload, string $id) use (&$store) { $s = $store->getSnapshot(); return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>$who,'baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene'][$who]['_entityRevision'],'payload'=>$payload], 'GM', true); };
    $fall = function (string $op) use (&$store) { $rows = array_values(array_filter($store->collisionEffects(['operationId'=>$op],'GM',true), fn ($r) => $r['kind'] === 'fall')); return $rows[0]['details'] ?? null; };
    $broken = fn () => $store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['roofs'][0]['broken'] ?? [];

    // Off the roost (8) onto the wooden deck (4): a fall of 4 is past wood's 3, so through the deck to the ground.
    $move('a', ['column'=>2,'row'=>1,'movementKind'=>'walk','path'=>[['column'=>1,'row'=>1],['column'=>2,'row'=>1]]], 'roost-to-deck');
    $d = $fall('roost-to-deck'); $a = $store->getSnapshot()['state']['placements']['scene']['a'];
    floorCheck(($d['breakThrough'][0]['material'] ?? null) === 'wood' && ($d['breakThrough'][0]['damage'] ?? null) === 5, 'Through the wooden deck for 5: ' . json_encode($d));
    floorCheck(($d['squares'] ?? null) === 8 && ($a['_supportSurfaceId'] ?? null) === null && array_column($d['breaks'] ?? [], 'id') === ['deck@2,1'], 'down to the ground, the one square under it breaking: ' . json_encode($d));
    floorCheck($broken() === [], 'Nothing breaks before the fall is confirmed');
    $store->collisionEffects(['operationId'=>'roost-to-deck:fall:a','targetId'=>'a','action'=>'start'],'GM',true,true);
    floorCheck($broken() === ['2,1'], 'Confirmed: that square is broken: ' . json_encode($broken()));
    echo "PASS a fall of 4 onto a wooden deck goes through one square to the ground\n";

    // Off the perch (11) onto the stone pillar (4): 7 is past stone's 6. The pillar breaks, and so do the deck squares it held up.
    $move('p', ['column'=>6,'row'=>3,'movementKind'=>'walk'], 'perch-to-pillar');
    $d = $fall('perch-to-pillar');
    floorCheck(($d['breakThrough'][0]['material'] ?? null) === 'stone', 'Through the stone pillar: ' . json_encode($d));
    $store->collisionEffects(['operationId'=>'perch-to-pillar:fall:p','targetId'=>'p','action'=>'start'],'GM',true,true);
    $now = $broken(); sort($now);
    floorCheck($now === ['2,1','5,1','6,1'], 'The pillar takes the squares it held up: ' . json_encode($now));
    echo "PASS a broken pillar takes the deck squares it holds up\n";

    // b stood on deck square 5,1. The page drops it (board-interactions.js): held at the deck's height, then let go.
    $patch = function (array $patch, string $op) use (&$store) { $s = $store->getSnapshot(); return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>$op,'baseRevision'=>$s['revision'],
        'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'b','entityRevision'=>$s['state']['placements']['scene']['b']['_entityRevision'],'patch'=>$patch]]]], 'GM', true); };
    $patch(['movementMode'=>'hover','flightHeight'=>4.0], 'drop-b-1');
    $patch(['movementMode'=>'ground','flightHeight'=>null], 'drop-b-2');
    $d = $fall('drop-b-2'); $b = $store->getSnapshot()['state']['placements']['scene']['b'];
    floorCheck(($d['squares'] ?? null) === 4 && ($b['_supportSurfaceId'] ?? null) === null, 'It falls 4 squares to the ground: ' . json_encode([$d, $b]));
    echo "PASS a creature on a broken square drops to the ground\n";
} finally { unset($store); @unlink($db); }
