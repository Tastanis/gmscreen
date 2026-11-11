<?php
declare(strict_types=1);
// Brandon, November 10, 2026: "finish the falling through things". A fall onto a breakable object hard enough to break
// it (squares fallen at least its Stamina: glass 1, wood 3, stone 6, metal 9, the rules table's fallBreakSquares a
// point) breaks through and falls on to what is under it. The walls break when the fall is confirmed; the fall panel
// adds the book's damage for the break (Stamina + 2). Softer, it lands on the top. Climbing down never breaks anything.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function fallCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$square = fn (float $x, float $y, float $size = 1.) => [['x'=>$x,'y'=>$y],['x'=>$x+$size,'y'=>$y],['x'=>$x+$size,'y'=>$y+$size],['x'=>$x,'y'=>$y+$size]];
$map = ['version'=>1,'labels'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[],'objects'=>[
    ['id'=>'snag','points'=>$square(7, 3),'base'=>0,'top'=>7,'standOn'=>true,'climbable'=>true],
    ['id'=>'leg-step','points'=>$square(6, 3),'base'=>0,'top'=>4,'standOn'=>true,'climbable'=>true,'material'=>'wood','group'=>'leg'],
    ['id'=>'post','points'=>$square(8, 3),'base'=>0,'top'=>5,'standOn'=>true,'material'=>'stone'],
    ['id'=>'deck','points'=>$square(5, 8),'base'=>0,'top'=>6,'standOn'=>true],
    ['id'=>'pane','points'=>$square(5, 9),'base'=>3,'top'=>4,'standOn'=>true,'material'=>'glass'],
    ['id'=>'table','points'=>$square(5, 9),'base'=>0,'top'=>1,'standOn'=>true],
    ['id'=>'roost','points'=>$square(9, 3),'base'=>0,'top'=>7,'standOn'=>true],
    ['id'=>'snag-2','points'=>$square(7, 6),'base'=>0,'top'=>7,'standOn'=>true,'climbable'=>true],
    ['id'=>'step-2','points'=>$square(6, 6),'base'=>0,'top'=>4,'standOn'=>true,'material'=>'wood'],
]];
$db = sys_get_temp_dir().'/vtt-fall-break-'.bin2hex(random_bytes(8)).'.sqlite';
try {
    $hero = fn (string $id, int $c, int $r, ?string $on) => ['id'=>$id,'name'=>$id,'profileId'=>'cal','team'=>'ally','column'=>$c,'row'=>$r,'width'=>1,'height'=>1,'levelId'=>'level-0','_supportSurfaceId'=>$on === null ? null : 'box-top:obj:'.$on];
    $store = new SyncV2Store($db);
    $board = ['placements'=>['scene'=>[$hero('a', 7, 3, 'snag'), $hero('d', 5, 8, 'deck'), $hero('e', 7, 6, 'snag-2'), $hero('c', 9, 3, 'roost')]],'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $s = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'fall-break-env','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$map]],'GM',true);
    $move = function (string $who, array $payload, string $id) use (&$store) { $s = $store->getSnapshot(); return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>$who,'baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene'][$who]['_entityRevision'],'payload'=>$payload], 'GM', true); };
    $fall = function (string $op) use (&$store) { $rows = array_values(array_filter($store->collisionEffects(['operationId'=>$op],'GM',true), fn ($r) => $r['kind'] === 'fall')); return $rows[0]['details'] ?? null; };
    $walls = function (string $object) use (&$store) { return array_values(array_filter($store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['segments'], fn ($e) => ($e['object'] ?? null) === $object)); };

    // The tester's case: north snag (7) to the leg step (4), wood. A fall of 3 is wood's 3: through it to the ground.
    // The page sends the path with both ends; with the step climbable the walker used to be put up onto it from the
    // ground under it, mid-fall, and no fall was counted (FloorSupport::walkContact, the hand test of Build 624).
    $move('a', ['column'=>6,'row'=>3,'movementKind'=>'walk','path'=>[['column'=>7,'row'=>3],['column'=>6,'row'=>3]]], 'snag-to-step');
    $details = $fall('snag-to-step'); $a = $store->getSnapshot()['state']['placements']['scene']['a'];
    fallCheck(($details['breakThrough'][0]['material'] ?? null) === 'wood' && ($details['breakThrough'][0]['damage'] ?? null) === 5, 'The fall breaks through the wooden step, for the book\'s 5: ' . json_encode($details));
    fallCheck(($details['squares'] ?? null) === 7 && empty($details['landsOn']) && ($a['_supportSurfaceId'] ?? null) === null, 'and falls on to the ground, 7 squares in all: ' . json_encode($details));
    fallCheck(count($details['breaks'] ?? []) === 4, 'Every wall of the step is to break');
    fallCheck(array_filter($walls('leg-step'), fn ($e) => ($e['broken'] ?? false) === true) === [], 'Nothing breaks before the fall is confirmed');
    $store->collisionEffects(['operationId'=>'snag-to-step:fall:a','targetId'=>'a','action'=>'start'],'GM',true,true);
    fallCheck(count(array_filter($walls('leg-step'), fn ($e) => ($e['broken'] ?? false) === true)) === 4, 'Confirmed: the step is broken');
    echo "PASS a fall of 3 onto a wooden step breaks through it to the ground\n";

    // Glass over a table: a fall of 2 from the deck (6) onto the pane (4) breaks the glass and lands on the table (1).
    $move('d', ['column'=>5,'row'=>9,'movementKind'=>'walk'], 'deck-to-pane');
    $d = $fall('deck-to-pane'); $dd = $store->getSnapshot()['state']['placements']['scene']['d'];
    fallCheck(($d['breakThrough'][0]['material'] ?? null) === 'glass' && ($d['breakThrough'][0]['damage'] ?? null) === 3, 'Through the glass for 3: ' . json_encode($d));
    fallCheck(($d['landsOn']['id'] ?? null) === 'box-top:obj:table' && ($dd['_supportSurfaceId'] ?? null) === 'box-top:obj:table' && ($d['squares'] ?? null) === 5, 'and onto the table under it, 5 squares: ' . json_encode($d));
    echo "PASS through a glass pane onto the table under it\n";

    // Climbing down all the way never breaks: the same drop of 3 onto wood, answered "Climb down", is on the step's top.
    $move('e', ['column'=>6,'row'=>6,'movementKind'=>'walk','climbDown'=>true], 'snag-climb-down');
    $d = $fall('snag-climb-down'); $ee = $store->getSnapshot()['state']['placements']['scene']['e'];
    fallCheck(empty($d['breakThrough']) && empty($d['breaks']) && ($ee['_supportSurfaceId'] ?? null) === 'box-top:obj:step-2', 'A climb down breaks nothing: ' . json_encode($d));
    echo "PASS climbing down breaks nothing\n";

    // Stone holds a fall of 2: from the roost (7) onto the post (5), it lands on the post's top.
    $move('c', ['column'=>8,'row'=>3,'movementKind'=>'walk'], 'roost-to-post');
    $d = $fall('roost-to-post'); $cc = $store->getSnapshot()['state']['placements']['scene']['c'];
    fallCheck(empty($d['breakThrough']) && ($cc['_supportSurfaceId'] ?? null) === 'box-top:obj:post' && ($d['squares'] ?? null) === 2, 'A fall of 2 onto stone lands on it: ' . json_encode($d));
    echo "PASS stone holds a fall of 2\n";
} finally { unset($store); @unlink($db); }

