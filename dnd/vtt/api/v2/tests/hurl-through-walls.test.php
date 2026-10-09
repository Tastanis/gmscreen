<?php
declare(strict_types=1);
// The book's "Hurling Through Objects": a creature force moved into a wall breaks it if enough of
// the push is left to pay for it (glass 1, wood 3, stone 6, metal 9 squares per square of wall),
// takes that material's damage (3, 5, 8, 11), and carries on with what is left. Nothing breaks
// unless the push is told to break through: the app asks first.
//
// The scene: a flat floor. A wall runs down the line between columns 9 and 10, in one-square
// pieces: wood beside row 5, stone beside row 6, a piece that cannot be broken beside row 7,
// glass beside row 8. Two wooden crates one square each, at (14,5) and (14,8); the first one's
// walls share a group name, the second one's do not.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function hurlCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$nodes = []; $segments = [];
foreach ([5 => 'wood', 6 => 'stone', 7 => null, 8 => 'glass'] as $row => $material) {
    $nodes[] = ['id'=>"line-$row", 'x'=>10, 'y'=>$row];
    $segments[] = ['id'=>"piece-$row", 'a'=>"line-$row", 'b'=>'line-' . ($row + 1), 'baseMode'=>'fixed', 'base'=>0.0, 'height'=>2.0, ...($material ? ['material'=>$material] : [])];
}
$nodes[] = ['id'=>'line-9', 'x'=>10, 'y'=>9];
foreach ([['crate', 5, ['group'=>'crate-1']], ['loose', 8, []]] as [$id, $row, $extra]) {
    foreach ([[14.04, $row + .04], [14.96, $row + .04], [14.96, $row + .96], [14.04, $row + .96]] as $k => [$x, $y]) $nodes[] = ['id'=>"$id-n$k", 'x'=>$x, 'y'=>$y];
    foreach ([0, 1, 2, 3] as $k) $segments[] = ['id'=>"$id-w$k", 'a'=>"$id-n$k", 'b'=>"$id-n" . (($k + 1) % 4), 'baseMode'=>'fixed', 'base'=>0.0, 'height'=>2.0, 'material'=>'wood', ...$extra];
}
$walls = ['version'=>1, 'nodes'=>$nodes, 'segments'=>$segments, 'roofs'=>[], 'ramps'=>[]];
$config = ['mapLevels'=>[], 'environment'=>['walls'=>['value'=>$walls]]];
$token = static fn ($column, $row, $size = 1, $id = 't') => ['id'=>$id, 'column'=>$column, 'row'=>$row, 'width'=>$size, 'height'=>$size, 'levelId'=>'level-0'];
$through = static fn (array $from, int $column, int $row, array $others = []) => ForcedMovement::through($from, ['column'=>$column, 'row'=>$row], [$from, ...$others], $config);
$ids = static function (array $plan): array { $list = array_column($plan['breaks'], 'id'); sort($list); return $list; };

// ---- the book's own example ----------------------------------------------------------
// Slid 5: moved 1, then into a wooden wall. 3 of the 4 squares left break it, for 5 damage, and
// the 1 square still left carries the creature through.
$plan = $through($token(8, 5), 13, 5);
hurlCheck($ids($plan) === ['piece-5'] && $plan['breakCost'] === 3 && $plan['breakDamage'] === 5, 'Wood: 3 squares of the push, 5 damage: ' . json_encode([$ids($plan), $plan['breakCost'], $plan['breakDamage']]));
hurlCheck([$plan['column'], $plan['row']] == [10, 5] && $plan['damage'] === 0 && $plan['wall'] === false, 'It ends 2 squares on, 1 past the wall, with no slam: ' . json_encode([$plan['column'], $plan['row'], $plan['damage']]));
hurlCheck($plan['steps'] === [['materials'=>['wood'=>1], 'cost'=>3, 'damage'=>5, 'left'=>4]], 'The pop-up is told: wood, 4 squares left, costs 3, 5 damage: ' . json_encode($plan['steps']));
hurlCheck([$plan['stopped']['column'], $plan['stopped']['row'], $plan['stopped']['damage']] == [9, 5, 6], 'And what stopping at the wall would be: 2 plus the 4 squares left');
echo "PASS the book's example: slid 5, through wood after 1, carried on 1\n";

// ---- each material, and not enough push ---------------------------------------------------
$plan = $through($token(8, 6), 13, 6);
hurlCheck($plan['breaks'] === [] && [$plan['column'], $plan['damage'], $plan['wall']] == [9, 6, true], 'Stone with 4 squares left does not break: an ordinary slam for 2 + 4');
$plan = $through($token(8, 6), 15, 6);
hurlCheck($ids($plan) === ['piece-6'] && $plan['breakCost'] === 6 && $plan['breakDamage'] === 8 && [$plan['column'], $plan['damage']] == [9, 0], 'Stone with exactly 6 left breaks, for 8, and the creature moves on 0');
$plan = $through($token(8, 6), 17, 6);
hurlCheck([$plan['column'], $plan['damage']] == [11, 0], 'With 8 left it moves on 2');
$plan = $through($token(8, 8), 10, 8);
hurlCheck($ids($plan) === ['piece-8'] && $plan['breakCost'] === 1 && $plan['breakDamage'] === 3 && $plan['column'] == 9, 'Glass costs 1 and does 3');
$plan = $through($token(8, 7), 30, 7);
hurlCheck($plan['breaks'] === [] && [$plan['column'], $plan['damage']] == [9, 23], 'A wall with no material never breaks, however hard the push');
hurlCheck(ForcedMovement::BREAK_COST === ['glass'=>1, 'wood'=>3, 'stone'=>6, 'metal'=>9] && ForcedMovement::BREAK_DAMAGE === ['glass'=>3, 'wood'=>5, 'stone'=>8, 'metal'=>11], 'The book\'s table');
// From the far side too, and a push along the wall strikes nothing.
$plan = $through($token(11, 5), 6, 5);
hurlCheck($ids($plan) === ['piece-5'] && $plan['column'] == 9, 'Pushed west through the same wall: 1 moved, 3 spent, 1 on');
hurlCheck($through($token(9, 5), 9, 8)['breaks'] === [] && $through($token(9, 5), 9, 8)['damage'] === 0, 'A push along a wall breaks nothing and slams nothing');
echo "PASS glass 1/3, wood 3/5, stone 6/8; not enough push is a slam; no material never breaks\n";

// ---- a large creature pays for every square of wall it strikes -----------------------------
$plan = $through($token(8, 5, 2), 16, 5);
hurlCheck($plan['breaks'] === [] && $plan['wall'] === true, 'Two squares wide against wood and stone needs 9; with 7 left nothing breaks');
$plan = $through($token(8, 5, 2), 18, 5);
hurlCheck($ids($plan) === ['piece-5', 'piece-6'] && $plan['breakCost'] === 9 && $plan['breakDamage'] === 13, 'With 9 left both break: 3 + 6 squares, 5 + 8 damage: ' . json_encode([$ids($plan), $plan['breakCost'], $plan['breakDamage']]));
hurlCheck($through($token(8, 6, 2), 40, 6)['breaks'] === [], 'Against stone and a piece that cannot break, nothing breaks');
// One long wall counts by the squares of it the creature meets, not as one piece.
$long = $config; $long['environment']['walls']['value'] = ['version'=>1, 'nodes'=>[['id'=>'a','x'=>10,'y'=>2],['id'=>'b','x'=>10,'y'=>9]], 'segments'=>[['id'=>'long','a'=>'a','b'=>'b','baseMode'=>'fixed','base'=>0.0,'height'=>2.0,'material'=>'wood']]];
$struck = WallMovement::struck($long['environment']['walls']['value'], $token(8, 5, 2), $token(18, 5, 2), $long);
hurlCheck($struck['walls'][0]['squares'] === 2 && abs($struck['distance'] - 0) < 1e-6, 'A large creature meets two squares of a long wall: ' . json_encode([$struck['walls'][0]['squares'], $struck['distance']]));
hurlCheck(WallMovement::struck($long['environment']['walls']['value'], $token(8, 5), $token(18, 5), $long)['walls'][0]['squares'] === 1, 'An ordinary one meets one');
echo "PASS a large creature pays per square of wall\n";

// ---- an object breaks as one thing ---------------------------------------------------------
$plan = $through($token(12, 5), 18, 5);
hurlCheck($ids($plan) === ['crate-w0','crate-w1','crate-w2','crate-w3'] && $plan['breakCost'] === 3 && $plan['breakDamage'] === 5, 'Into the crate: all four walls go for the price of the side struck: ' . json_encode([$ids($plan), $plan['breakCost']]));
hurlCheck([$plan['column'], $plan['damage']] == [15, 0], 'and the creature goes on through where it stood');
// Walls with no group name are each their own thing: the far side still stands.
$plan = $through($token(12, 8), 18, 8);
hurlCheck($ids($plan) === ['loose-w3'] && $plan['wall'] === true && $plan['column'] == 13, 'Without a group name only the side struck breaks, and the creature stops against the rest: ' . json_encode([$ids($plan), $plan['column'], $plan['damage']]));
echo "PASS walls that share a group break together for one price\n";

// ---- what is left of the push still collides ---------------------------------------------
$plan = $through($token(8, 5), 14, 5, [$token(11, 5, 1, 'other')]);
hurlCheck($ids($plan) === ['piece-5'] && $plan['collidedIds'] === ['other'] && $plan['column'] == 10 && $plan['damage'] === 1 && $plan['breakDamage'] === 5, 'Through the wood, then into a creature with 1 square left: ' . json_encode([$plan['column'], $plan['damage'], $plan['collidedIds']]));
echo "PASS the rest of the push collides as any push does\n";

// ---- through the real store ------------------------------------------------------------------
$open = static function (array $tokens) use ($walls): array {
    $database = sys_get_temp_dir() . '/vtt-hurl-' . bin2hex(random_bytes(6)) . '.sqlite';
    $store = new SyncV2Store($database);
    $store->migrateLegacyPlacements(['placements'=>['scene'=>$tokens]]);
    $snap = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'hurl-env-walls','sceneId'=>'scene','baseRevision'=>$snap['revision'],
        'entityRevision'=>(int) ($snap['state']['sceneConfig']['scene']['_revision'] ?? 0),'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$walls]], 'gm', true);
    return [$store, $database];
};
$brokenIn = static fn (SyncV2Store $store) => array_values(array_column(array_filter($store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['segments'], static fn ($edge) => ($edge['broken'] ?? false) === true), 'id'));
$send = static function (SyncV2Store $store, string $operation, array $payload, string $actor = 'gm') {
    $snap = $store->getSnapshot(); $t = $snap['state']['placements']['scene']['t'];
    return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$operation,'sceneId'=>'scene','entityId'=>'t','baseRevision'=>$snap['revision'],'entityRevision'=>$t['_entityRevision'] ?? 0,'payload'=>$payload], $actor, $actor === 'gm');
};
[$store, $database] = $open([[...$token(8, 5), 'team'=>'enemy'], [...$token(11, 5, 1, 'other'), 'team'=>'ally']]);
try {
    // Asked first: what would this push break? The answer is what the pop-up shows.
    $offer = $store->forcedBreakOffer('scene', 't', ['column'=>14, 'row'=>5], false);
    hurlCheck($offer['destination'] == ['column'=>10, 'row'=>5] && $offer['breakDamage'] === 5 && $offer['damage'] === 1 && $offer['collidedIds'] === ['other'] && $offer['steps'][0]['materials'] === ['wood'=>1], 'The offer: through wood for 5, then 1 more from the creature beyond: ' . json_encode($offer));
    hurlCheck($offer['stopped'] == ['column'=>9, 'row'=>5, 'damage'=>7], 'and what stopping at the wall would cost');
    hurlCheck($store->forcedBreakOffer('scene', 't', ['column'=>8, 'row'=>9], false) === null, 'A push that strikes nothing gets no offer');
    hurlCheck($brokenIn($store) === [], 'Asking breaks nothing');
    // A wrong landing square is refused, and nothing is broken by the attempt.
    $before = $store->getSnapshot();
    try { $send($store, 'hurl-wrong-square', ['column'=>12, 'row'=>5, 'movementKind'=>'forced', 'forcedDestination'=>['column'=>14, 'row'=>5, 'breakThrough'=>true]]); hurlCheck(false, 'A wrong landing was accepted'); }
    catch (InvalidArgumentException $error) { hurlCheck($store->getSnapshot() === $before, 'A refused break-through leaves the wall standing and the scene unchanged'); }
    // Told to break through.
    $revision = $before['revision'];
    $result = $send($store, 'hurl-through-wood', ['column'=>10, 'row'=>5, 'movementKind'=>'forced', 'forcedDestination'=>['column'=>14, 'row'=>5, 'breakThrough'=>true]]);
    hurlCheck($result['status'] === 'accepted' && $brokenIn($store) === ['piece-5'], 'The push breaks the wooden piece and nothing else: ' . json_encode($brokenIn($store)));
    $after = $store->getSnapshot(); $t = $after['state']['placements']['scene']['t'];
    hurlCheck([(float) $t['column'], (float) $t['row']] === [10.0, 5.0], 'and the creature is through it');
    $events = $store->replayAfter($revision)['events'];
    hurlCheck(array_column($events, 'type') === ['environment.changed', 'token.moved'] && $events[0]['payload']['cause'] === 'forced', 'Every browser hears the wall break, then the move: ' . json_encode(array_column($events, 'type')));
    $records = array_column($store->collisionEffects(['operationId'=>'hurl-through-wood'], 'gm', true), 'amount', 'targetId');
    hurlCheck($records == ['t'=>6, 'other'=>1], 'The pushed creature takes 5 for the wall and 1 for the collision; the creature it struck takes 1: ' . json_encode($records));
    // Sent again (a retry after a lost reply), it is the same move, not a second break.
    $again = $send($store, 'hurl-through-wood', ['column'=>10, 'row'=>5, 'movementKind'=>'forced', 'forcedDestination'=>['column'=>14, 'row'=>5, 'breakThrough'=>true]]);
    hurlCheck(($again['idempotent'] ?? false) === true && $store->getSnapshot()['revision'] === $after['revision'], 'A repeat of the same command changes nothing');
    unset($store);
} finally { @unlink($database); }
// Not told to break through: the same push is an ordinary slam, as it always was.
[$store, $database] = $open([[...$token(8, 5), 'team'=>'enemy']]);
try {
    $send($store, 'hurl-plain-slam', ['column'=>9, 'row'=>5, 'movementKind'=>'forced', 'forcedDestination'=>['column'=>13, 'row'=>5]]);
    $records = array_column($store->collisionEffects(['operationId'=>'hurl-plain-slam'], 'gm', true), 'amount', 'targetId');
    hurlCheck($brokenIn($store) === [] && $records == ['t'=>6], 'Without the word, nothing breaks: 2 + 4 for the slam');
    unset($store);
} finally { @unlink($database); }
// A hero's ability pushes through the other path, by a player.
[$store, $database] = $open([[...$token(8, 8), 'team'=>'enemy']]);
try {
    $snap = $store->getSnapshot();
    $command = ['type'=>'placement.batch','operationId'=>'hurl-ability-glass','baseRevision'=>$snap['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'t','entityRevision'=>0,
        'movementKind'=>'forced','forcedDestination'=>['column'=>11, 'row'=>8, 'breakThrough'=>true],'collisionDamageType'=>'fire','patch'=>['column'=>10, 'row'=>8]]]]];
    hurlCheck($store->acceptPlacementBatch($command, 'cal', false)['status'] === 'accepted', 'A player\'s ability pushes an enemy through glass');
    $records = $store->collisionEffects(['operationId'=>'hurl-ability-glass'], 'cal', false);
    hurlCheck($brokenIn($store) === ['piece-8'] && count($records) === 1 && $records[0]['amount'] === 3 && $records[0]['damageType'] === 'fire', 'The glass breaks and the enemy takes 3: ' . json_encode([$brokenIn($store), $records]));
    $seen = array_column(SceneEnvironment::project($store->getSnapshot()['state']['sceneConfig']['scene']['environment'])['walls']['value']['segments'], null, 'id');
    hurlCheck(($seen['piece-8']['material'] ?? null) === 'glass' && !array_key_exists('material', $seen['piece-5']), 'The player learns the material of what broke, not of what still stands');
    hurlCheck(($store->acceptPlacementBatch($command, 'cal', false)['idempotent'] ?? false) === true, 'A repeat is the same move');
    unset($store);
} finally { @unlink($database); }
echo "PASS through the store: asked first, broken only on the word, refused whole, repeated safely\n";
