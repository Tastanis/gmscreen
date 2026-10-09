<?php
declare(strict_types=1);
// A creature that falls onto a thing standing in a square (walls that run through the square, not
// along its edge) used to be left inside it, walled in on every side. Now:
//   - a thing that can be broken is broken by the fall, once the fall is confirmed in the review;
//   - a thing that cannot be broken puts the creature in the nearest free square beside it.
//
// The scene: an island 6 high (columns 20 to 29, rows 10 to 19) over a flat floor. On the floor
// just off its south edge: a stone tooth that can be broken at (24,20), a pillar that cannot at
// (27,20), and a wooden crate two squares wide at (21,20)-(22,20) whose walls share a group name.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function objectCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$ring = static fn ($l, $t, $r, $b) => [['x'=>$l,'y'=>$t],['x'=>$r,'y'=>$t],['x'=>$r,'y'=>$b],['x'=>$l,'y'=>$b]];
$holes = static fn ($l, $t, $r, $b) => [
    ['column'=>0,'row'=>0,'width'=>40,'height'=>$t], ['column'=>0,'row'=>$b,'width'=>40,'height'=>30-$b],
    ['column'=>0,'row'=>$t,'width'=>$l,'height'=>$b-$t], ['column'=>$r,'row'=>$t,'width'=>40-$r,'height'=>$b-$t],
];
/** A ring of four walls round `wide` squares, set in a little from the grid lines. */
$object = static function (string $id, int $column, int $row, int $wide, array $extra): array {
    $c = [[$column + .04, $row + .04], [$column + $wide - .04, $row + .04], [$column + $wide - .04, $row + .96], [$column + .04, $row + .96]];
    $nodes = []; $segments = [];
    foreach ($c as $k => [$x, $y]) $nodes[] = ['id'=>"$id-n$k", 'x'=>$x, 'y'=>$y];
    foreach ([0, 1, 2, 3] as $k) $segments[] = ['id'=>"$id-w$k", 'a'=>"$id-n$k", 'b'=>"$id-n" . (($k + 1) % 4), 'baseMode'=>'fixed', 'base'=>0.0, 'height'=>2.0, 'sight'=>'block', 'movement'=>'block', ...$extra];
    return [$nodes, $segments];
};
[$toothNodes, $toothWalls] = $object('tooth', 24, 20, 1, ['material'=>'stone']);
[$pillarNodes, $pillarWalls] = $object('pillar', 27, 20, 1, []);
[$crateNodes, $crateWalls] = $object('crate', 21, 20, 2, ['material'=>'wood', 'group'=>'crate-1']);
$scene = [
    'mapLevels'=>['activeLevelId'=>'level-0','baseStairs'=>[],'levels'=>[['id'=>'low','name'=>'Low','elevationSquares'=>6,'zIndex'=>1,'cutouts'=>$holes(20,10,30,20),'stairs'=>[]]]],
    'walls'=>['version'=>1,'nodes'=>[...$toothNodes, ...$pillarNodes, ...$crateNodes],'segments'=>[...$toothWalls, ...$pillarWalls, ...$crateWalls],
        'roofs'=>[['id'=>'island','kind'=>'floor','levelId'=>'low','height'=>6.0,'points'=>$ring(20,10,30,20),'holes'=>[],'nodes'=>[]]],'ramps'=>[]],
];
/** A fresh copy of the scene with one creature (owned by the player cal) and any others given. */
$open = static function (array $at, array $others = []) use ($scene): array {
    $database = sys_get_temp_dir() . '/vtt-fall-objects-' . bin2hex(random_bytes(6)) . '.sqlite';
    $store = new SyncV2Store($database);
    $placed = [['id'=>'t','name'=>'t','team'=>'ally','profileId'=>'cal','column'=>$at[0],'row'=>$at[1],'width'=>1,'height'=>1,'levelId'=>$at[2]]];
    foreach ($others as $i => [$column, $row, $level]) $placed[] = ['id'=>"other$i",'name'=>"other$i",'team'=>'ally','column'=>$column,'row'=>$row,'width'=>1,'height'=>1,'levelId'=>$level];
    $board = ['placements'=>['scene'=>$placed], 'sceneState'=>['scene'=>['mapLevels'=>$scene['mapLevels']]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $snap = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'objects-env-walls','sceneId'=>'scene','baseRevision'=>$snap['revision'],
        'entityRevision'=>$snap['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$scene['walls']]], 'gm', true);
    return [$store, $database];
};
$move = static function (SyncV2Store $store, string $operation, int $column, int $row, string $kind, string $actor = 'gm') {
    $snap = $store->getSnapshot(); $token = $snap['state']['placements']['scene']['t'];
    try { return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$operation,'sceneId'=>'scene','entityId'=>'t','baseRevision'=>$snap['revision'],
        'entityRevision'=>$token['_entityRevision'] ?? 0,'payload'=>['column'=>$column,'row'=>$row,'movementKind'=>$kind]], $actor, $actor === 'gm'); }
    catch (InvalidArgumentException $error) { return $error->getMessage(); }
};
$where = static fn (SyncV2Store $store) => (static fn ($t) => [(float) $t['column'], (float) $t['row'], $t['levelId']])($store->getSnapshot()['state']['placements']['scene']['t']);
$walls = static fn (SyncV2Store $store) => array_column($store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['segments'], null, 'id');
$broken = static fn (SyncV2Store $store, string $prefix) => count(array_filter($walls($store), static fn ($edge) => str_starts_with($edge['id'], $prefix) && ($edge['broken'] ?? false) === true));

// ---- onto something that can be broken ---------------------------------------------
[$store, $database] = $open([24, 19, 'low']);
try {
    $move($store, 'push-onto-tooth', 24, 20, 'forced');
    objectCheck($where($store) === [24.0, 20.0, 'level-0'], 'Pushed off the island onto the tooth, the creature lands in the tooth\'s square: ' . json_encode($where($store)));
    $record = $store->collisionEffects(['operationId'=>'push-onto-tooth'], 'gm', true)[0];
    objectCheck($record['kind'] === 'fall' && $record['details']['squares'] === 6 && $record['details']['relocated'] === false, 'It is a fall of 6 and the creature is not moved aside');
    objectCheck($record['amount'] === 12, 'The damage is the fall\'s own: nothing is added for the thing it lands on');
    $ids = array_column($record['details']['breaks'], 'id'); sort($ids);
    objectCheck($ids === ['tooth-w0','tooth-w1','tooth-w2','tooth-w3'] && array_unique(array_column($record['details']['breaks'], 'material')) === ['stone'], 'The review is told which walls the fall breaks and what they are made of: ' . json_encode($record['details']['breaks']));
    // Nothing breaks until the fall is confirmed.
    objectCheck($broken($store, 'tooth') === 0, 'Before the fall is confirmed the tooth still stands');
    $revision = $store->getSnapshot()['revision'];
    $key = ['operationId'=>$record['operationId'], 'targetId'=>'t'];
    $claim = $store->collisionEffects([...$key, 'action'=>'start'], 'gm', true, true);
    objectCheck($claim['granted'] && ($claim['brokenWalls'] ?? 0) === 4, 'Confirming the fall breaks the tooth: ' . json_encode($claim));
    objectCheck($broken($store, 'tooth') === 4 && $broken($store, 'pillar') === 0 && $broken($store, 'crate') === 0, 'All four of its walls are broken, and nothing else');
    $after = $store->getSnapshot();
    objectCheck($after['revision'] === $revision + 1 && $after['state']['sceneConfig']['scene']['environment']['walls']['revision'] === 2, 'The break is one change to the scene, with its own revision');
    $events = $store->replayAfter($revision)['events'];
    objectCheck(count($events) === 1 && $events[0]['type'] === 'environment.changed' && $events[0]['payload']['field'] === 'walls', 'Every browser is told the way a wall save tells them: ' . json_encode(array_column($events, 'type')));
    // A second claim neither replays the damage nor breaks anything again.
    objectCheck(!$store->collisionEffects([...$key, 'action'=>'start'], 'gm', true, true)['granted'] && $store->getSnapshot()['revision'] === $revision + 1, 'The fall is confirmed once');
    $store->collisionEffects([...$key, 'action'=>'finish', 'status'=>'completed'], 'gm', true, true);
    // The creature is no longer walled in.
    objectCheck(is_array($move($store, 'walk-out', 25, 20, 'walk', 'cal')) && $where($store) === [25.0, 20.0, 'level-0'], 'The player walks out over the rubble');
    unset($store);
} finally { @unlink($database); }
echo "PASS a fall onto something breakable breaks it when the fall is confirmed\n";

// ---- dismissed, or the player's own fall --------------------------------------------
[$store, $database] = $open([24, 19, 'low']);
try {
    objectCheck(is_array($move($store, 'walk-onto-tooth', 24, 20, 'walk', 'cal')), 'A player walks off the edge over the tooth');
    $record = $store->collisionEffects(['operationId'=>'walk-onto-tooth'], 'cal', false)[0];
    objectCheck(count($record['details']['breaks']) === 4 && $record['details']['movementKind'] === 'walk', 'Their own review is told what the fall breaks');
    $stuck = $move($store, 'stuck-in-tooth', 25, 20, 'walk', 'cal');
    objectCheck($stuck === 'Movement blocked by a wall or closed door/window.', 'Until it is confirmed the tooth stands, and holds them: ' . json_encode(is_array($stuck) ? [$stuck['status'], $where($store)] : $stuck));
    objectCheck($store->collisionEffects(['operationId'=>'walk-onto-tooth'], 'sharon', false) === [], 'Another player is told nothing');
    try { $store->collisionEffects(['operationId'=>$record['operationId'], 'targetId'=>'t', 'action'=>'start'], 'sharon', false, true); objectCheck(false, 'Another player confirmed the fall'); }
    catch (InvalidArgumentException $error) { objectCheck($broken($store, 'tooth') === 0, 'Another player cannot break it by confirming'); }
    $claim = $store->collisionEffects(['operationId'=>$record['operationId'], 'targetId'=>'t', 'action'=>'start'], 'cal', false, true);
    objectCheck($claim['granted'] && $broken($store, 'tooth') === 4, 'The player who fell confirms it, and it breaks');
    // What a player is sent: the material of the walls that are now broken, and of no others.
    $seen = array_column(SceneEnvironment::project($store->getSnapshot()['state']['sceneConfig']['scene']['environment'])['walls']['value']['segments'], null, 'id');
    objectCheck(($seen['tooth-w0']['material'] ?? null) === 'stone' && !array_key_exists('material', $seen['crate-w0']), 'A player learns the material of what broke, not of what still stands');
    unset($store);
} finally { @unlink($database); }
[$store, $database] = $open([24, 19, 'low']);
try {
    $move($store, 'push-dismissed', 24, 20, 'forced');
    $record = $store->collisionEffects(['operationId'=>'push-dismissed'], 'gm', true)[0];
    $store->collisionEffects(['operationId'=>$record['operationId'], 'targetId'=>'t', 'action'=>'finish', 'status'=>'dismissed'], 'gm', true, true);
    objectCheck($broken($store, 'tooth') === 0, 'A dismissed fall breaks nothing');
    unset($store);
} finally { @unlink($database); }
echo "PASS the player who fell may confirm it; a dismissed fall breaks nothing\n";

// ---- an object's walls break together ------------------------------------------------
[$store, $database] = $open([21, 19, 'low']);
try {
    $move($store, 'push-onto-crate', 21, 20, 'forced');
    objectCheck($where($store) === [21.0, 20.0, 'level-0'], 'Pushed onto the west half of the crate');
    $record = $store->collisionEffects(['operationId'=>'push-onto-crate'], 'gm', true)[0];
    $ids = array_column($record['details']['breaks'], 'id'); sort($ids);
    objectCheck($ids === ['crate-w0','crate-w1','crate-w2','crate-w3'], 'The whole crate is listed, the wall in the next square too: ' . json_encode($ids));
    $store->collisionEffects(['operationId'=>$record['operationId'], 'targetId'=>'t', 'action'=>'start'], 'gm', true, true);
    objectCheck($broken($store, 'crate') === 4 && $broken($store, 'tooth') === 0, 'And the whole crate breaks');
    unset($store);
} finally { @unlink($database); }
echo "PASS walls that share a group break as one thing\n";

// ---- onto something that cannot be broken -----------------------------------------------
[$store, $database] = $open([27, 19, 'low']);
try {
    $move($store, 'push-onto-pillar', 27, 20, 'forced');
    $at = $where($store);
    objectCheck($at === [26.0, 20.0, 'level-0'], 'Pushed onto the pillar, the creature lands in the nearest free square beside it: ' . json_encode($at));
    $record = $store->collisionEffects(['operationId'=>'push-onto-pillar'], 'gm', true)[0];
    objectCheck($record['details']['relocated'] === true && $record['details']['collidedIds'] === [] && !isset($record['details']['breaks']) && $record['details']['squares'] === 6, 'It is moved aside, hits no one, breaks nothing, and falls the same 6');
    objectCheck(is_array($move($store, 'walk-onward', 26, 21, 'walk', 'cal')), 'And it is free to walk on');
    unset($store);
} finally { @unlink($database); }
// With a creature in the nearest square, it takes the next one. Neither it nor a square under
// something else is ever chosen.
[$store, $database] = $open([27, 19, 'low'], [[26, 20, 'level-0']]);
try {
    $move($store, 'push-onto-pillar-2', 27, 20, 'forced');
    $at = $where($store);
    objectCheck(!in_array($at, [[27.0, 20.0, 'level-0'], [26.0, 20.0, 'level-0']], true) && max(abs($at[0] - 27), abs($at[1] - 20)) <= 1.0, 'The next nearest free square: ' . json_encode($at));
    $config = $store->getSnapshot()['state']['sceneConfig']['scene'];
    objectCheck(WallObjects::under(['column'=>$at[0],'row'=>$at[1],'width'=>1,'height'=>1,'levelId'=>'level-0'], $config) === [], 'which nothing stands in');
    unset($store);
} finally { @unlink($database); }
echo "PASS a fall onto something that cannot be broken lands beside it\n";

// ---- what counts as standing in a square -------------------------------------------------
$config = ['mapLevels'=>$scene['mapLevels'], 'environment'=>['walls'=>['value'=>$scene['walls']]]];
$token = static fn ($column, $row, $level = 'level-0', $size = 1) => ['column'=>$column,'row'=>$row,'width'=>$size,'height'=>$size,'levelId'=>$level];
objectCheck(count(WallObjects::under($token(24, 20), $config)) === 4, 'The tooth\'s four walls are in its square');
objectCheck(WallObjects::under($token(25, 20), $config) === [] && WallObjects::under($token(24, 21), $config) === [], 'They are not in the squares beside it');
objectCheck(count(WallObjects::under($token(21, 20), $config)) === 3 && count(WallObjects::under($token(22, 20), $config)) === 3, 'Each half of the crate has three of its walls in it');
objectCheck(count(WallObjects::under($token(23, 19, 'level-0', 2), $config)) === 4, 'A large creature over the tooth has it under it');
objectCheck(WallObjects::under([...$token(24, 20), 'movementMode'=>'fly', 'flightHeight'=>6], $config) === [], 'A creature six squares above it does not');
// A wall along the edge of a square is beside the creature, not under it.
$edge = $config; $edge['environment']['walls']['value'] = ['version'=>1,'nodes'=>[['id'=>'a','x'=>10,'y'=>5],['id'=>'b','x'=>10,'y'=>6]],'segments'=>[['id'=>'w','a'=>'a','b'=>'b']]];
objectCheck(WallObjects::under($token(9, 5), $edge) === [] && WallObjects::under($token(10, 5), $edge) === [], 'A wall on the grid line is in neither square');
$edge['environment']['walls']['value']['nodes'] = [['id'=>'a','x'=>10.5,'y'=>5],['id'=>'b','x'=>10.5,'y'=>6]];
objectCheck(count(WallObjects::under($token(10, 5), $edge)) === 1, 'A wall through the middle of a square is in it');
foreach ([['broken'=>true,'material'=>'wood'], ['movement'=>'pass'], ['interaction'=>'door','open'=>true], ['movementDirection'=>'left']] as $extra) {
    $edge['environment']['walls']['value']['segments'] = [['id'=>'w','a'=>'a','b'=>'b', ...$extra]];
    objectCheck(WallObjects::under($token(10, 5), $edge) === [], 'Not in the way: ' . json_encode($extra));
}
echo "PASS what stands in a square\n";

// ---- a plain fall is as it was --------------------------------------------------------------
[$store, $database] = $open([25, 19, 'low']);
try {
    $move($store, 'plain-fall', 25, 20, 'forced');
    $record = $store->collisionEffects(['operationId'=>'plain-fall'], 'gm', true)[0];
    objectCheck($where($store) === [25.0, 20.0, 'level-0'] && !array_key_exists('breaks', $record['details']) && $record['details']['relocated'] === false, 'A fall onto open floor is unchanged');
    $revision = $store->getSnapshot()['revision'];
    $store->collisionEffects(['operationId'=>$record['operationId'], 'targetId'=>'t', 'action'=>'start'], 'gm', true, true);
    objectCheck($store->getSnapshot()['revision'] === $revision, 'and confirming it changes nothing in the scene');
    unset($store);
} finally { @unlink($database); }
echo "PASS a fall onto open floor is unchanged\n";
