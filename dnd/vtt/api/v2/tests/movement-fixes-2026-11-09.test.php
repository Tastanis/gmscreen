<?php
declare(strict_types=1);
// The movement fix list of November 9, 2026 (docs/vtt-movement-fix-list-2026-11-09.md), server side.
// G: a creature standing right behind a wall is not hit through it; the wall is met first, and a breakable one is
//    offered to break, after which the creature beyond is met. The browser's side is in forced-drag (token-system
//    __tests__/movement-fixes-2026-11-09.test.mjs).
// L: a teleport's fall is counted to the nearest whole square, as every other fall (FallOutcome::plan).
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function fixCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// A wall down the line x = 10: wood beside row 5, a piece that cannot be broken beside row 7.
$nodes = []; $segments = [];
foreach ([5 => 'wood', 6 => 'stone', 7 => null] as $row => $material) {
    $nodes[] = ['id'=>"line-$row", 'x'=>10, 'y'=>$row];
    $segments[] = ['id'=>"piece-$row", 'a'=>"line-$row", 'b'=>'line-' . ($row + 1), 'baseMode'=>'fixed', 'base'=>0.0, 'height'=>2.0, ...($material ? ['material'=>$material] : [])];
}
$nodes[] = ['id'=>'line-8', 'x'=>10, 'y'=>8];
$config = ['mapLevels'=>[], 'environment'=>['walls'=>['value'=>['version'=>1, 'nodes'=>$nodes, 'segments'=>$segments, 'roofs'=>[], 'ramps'=>[]]]]];
$token = static fn ($column, $row, $id = 't') => ['id'=>$id, 'column'=>$column, 'row'=>$row, 'width'=>1, 'height'=>1, 'levelId'=>'level-0'];

// ---- G: right behind an unbreakable wall
$mover = $token(8, 7); $behind = $token(10, 7, 'c');
$plan = ForcedMovement::resolve($mover, ['column'=>13, 'row'=>7], [$mover, $behind], $config);
fixCheck([$plan['column'], $plan['wall'], $plan['collidedIds']] == [9, true, []] && $plan['damage'] === 6, 'The wall is met, the creature behind it untouched: ' . json_encode($plan));
$front = ForcedMovement::resolve($mover, ['column'=>13, 'row'=>7], [$mover, $token(9, 7, 'c')], $config);
fixCheck($front['wall'] === false && $front['collidedIds'] === ['c'], 'A creature in front of the wall is still hit first');
$clear = ForcedMovement::resolve($mover, ['column'=>13, 'row'=>7], [$mover], $config);
fixCheck([$clear['column'], $clear['wall'], $clear['damage']] == [9, true, 6], 'With nobody behind it, the same');
echo "PASS a creature right behind a wall is not hit through it\n";

// ---- G: right behind a breakable wall: the break is offered, and the creature beyond is met after it
$mover = $token(8, 5); $behind = $token(10, 5, 'c');
$offer = ForcedMovement::through($mover, ['column'=>13, 'row'=>5], [$mover, $behind], $config);
fixCheck(array_column($offer['breaks'], 'id') === ['piece-5'], 'The wooden wall is offered to break: ' . json_encode(array_column($offer['breaks'], 'id')));
fixCheck($offer['collidedIds'] === ['c'] && [$offer['column'], $offer['row']] == [9, 5], 'Through it, the creature right behind is met, and the mover stops short of it: ' . json_encode($offer));
echo "PASS a breakable wall with a creature right behind it offers the break, then meets the creature\n";

// ---- L: a teleport's fall, to the nearest square
$ground = ['mapLevels'=>['levels'=>[]], 'environment'=>[]];
$from = ['id'=>'pc', 'column'=>0, 'row'=>0, 'width'=>1, 'height'=>1, 'levelId'=>'level-0'];
foreach ([[2.6, 3], [3.5, 4], [3.4, 3], [1.0, 1], [0.99, null]] as [$height, $squares]) {
    $r = TeleportLanding::resolve($from, [...$from, 'column'=>1], $ground, ['height'=>$height], false);
    fixCheck(($r['fall']['squares'] ?? null) === $squares, "A teleport $height up falls $squares: " . json_encode($r['fall']));
}
echo "PASS a teleport falls to the nearest whole square, as every fall does\n";

// ---- R1 (break-through review): Ctrl+Z in a running turn mends the wall the undone push broke
$database = sys_get_temp_dir() . '/vtt-fixes-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $pusher = ['id'=>'cal', 'name'=>'Cal', 'profileId'=>'cal', 'combatTeam'=>'ally', 'team'=>'ally', 'column'=>2, 'row'=>5, 'width'=>1, 'height'=>1, 'levelId'=>'level-0'];
    $target = ['id'=>'t', 'name'=>'Goblin', 'combatTeam'=>'enemy', 'team'=>'enemy', 'column'=>8, 'row'=>5, 'width'=>1, 'height'=>1, 'levelId'=>'level-0'];
    $board = ['placements'=>['scene'=>[$pusher, $target]], 'sceneState'=>['scene'=>$config]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $s = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set', 'sceneId'=>'scene', 'operationId'=>'fixes-walls', 'baseRevision'=>$s['revision'], 'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'], 'payload'=>['field'=>'walls', 'expectedRevision'=>0, 'value'=>$config['environment']['walls']['value']]], 'GM', true);
    $n = 0;
    $combat = static function (string $type, array $payload) use ($store, &$n) { return $store->acceptCombatCommand(['operationId'=>'fixes-combat-' . (++$n), 'type'=>$type, 'baseRevision'=>$store->getSnapshot()['revision'], 'sceneId'=>'scene', 'payload'=>$payload], 'GM', true); };
    $combat('combat.start', ['startingTeam'=>'ally', 'encounterId'=>'enc-fixes', 'combat'=>['active'=>true, 'malice'=>0, 'groups'=>[], 'lastEffects'=>[]]]);
    $combat('turn.start', ['combatantId'=>'cal', 'holderName'=>'Cal']);
    $s = $store->getSnapshot();
    $store->acceptTokenMove(['type'=>'token.move', 'operationId'=>'fixes-push-through', 'sceneId'=>'scene', 'entityId'=>'t', 'baseRevision'=>$s['revision'], 'entityRevision'=>$s['state']['placements']['scene']['t']['_entityRevision'],
        'payload'=>['column'=>10, 'row'=>5, 'movementKind'=>'forced', 'forcedDestination'=>['column'=>13, 'row'=>5, 'breakThrough'=>true]]], 'GM', true);
    $broken = static fn () => array_values(array_map(fn ($e) => $e['id'], array_filter($store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['segments'], fn ($e) => ($e['broken'] ?? false) === true)));
    fixCheck($broken() === ['piece-5'] && $store->getSnapshot()['state']['placements']['scene']['t']['column'] == 11, 'The push broke the wooden wall and went through: ' . json_encode($broken()));
    $result = $store->undoTurnSteps(['sceneId'=>'scene', 'operationId'=>'fixes-undo-1'], 'GM', false);
    fixCheck($store->getSnapshot()['state']['placements']['scene']['t']['column'] == 8, 'The turn undo puts the creature back');
    fixCheck($broken() === [], 'and the wall is whole again: ' . json_encode($broken()));
    fixCheck((bool) array_filter($result['events'], fn ($e) => $e['type'] === 'environment.changed'), 'and the page is told');
} finally { unset($store); foreach (['', '-wal', '-shm'] as $suffix) @unlink($database . $suffix); }
echo "PASS Ctrl+Z in a running turn mends the wall the undone push broke\n";

// ---- R4 (break-through review, November 10, 2026: follow the book): a slide's later legs pay for a break too
$mover = $token(8, 5);
$noBeyond = ForcedMovement::through($mover, ['column'=>10, 'row'=>5], [$mover], $config);
fixCheck($noBeyond['breaks'] === [], 'A leg with 1 square left cannot pay for wood on its own');
$withBeyond = ForcedMovement::through($mover, ['column'=>10, 'row'=>5, 'beyond'=>3], [$mover], $config);
fixCheck(array_column($withBeyond['breaks'], 'id') === ['piece-5'] && $withBeyond['breakCost'] === 3, 'With 3 more to come in the slide, the wood breaks: ' . json_encode(array_column($withBeyond['breaks'], 'id')));
fixCheck([$withBeyond['column'], $withBeyond['row']] == [10, 5] && ($withBeyond['intent']['beyond'] ?? null) === 1, 'The leg reaches its corner and 1 of the later squares is left: ' . json_encode([$withBeyond['column'], $withBeyond['intent']]));
echo "PASS a slide pays for a break out of its later legs, which are cut short by it\n";
