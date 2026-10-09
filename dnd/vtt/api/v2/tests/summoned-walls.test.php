<?php
declare(strict_types=1);
// A wall made during play (the template tool, or an ability) is a list of cubes. It can be given
// what it takes to break it: one of the book's materials, or a Stamina for each square. Each
// cube is then one breakable object. A wall given neither is not breakable, as before.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function summonCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function summonRefused(array $template, string $because, string $message): void {
    try { WallCubes::validate($template); }
    catch (InvalidArgumentException $error) { summonCheck(str_contains($error->getMessage(), $because), $message . ': refused for the wrong reason: ' . $error->getMessage()); return; }
    throw new RuntimeException($message . ': it was accepted');
}
/** A wall of cubes in column 10, rows 5 to 7, with the extra fields given. */
$wall = static fn (array $extra = [], array $squares = [['column'=>10,'row'=>5],['column'=>10,'row'=>6],['column'=>10,'row'=>7]]) => ['id'=>'summoned','type'=>'wall','levelId'=>'level-0','squares'=>$squares, ...$extra];
$token = static fn ($column, $row, $size = 1, $id = 't') => ['id'=>$id, 'column'=>$column, 'row'=>$row, 'width'=>$size, 'height'=>$size, 'levelId'=>'level-0'];

// ---- what may be stored ---------------------------------------------------------------
WallCubes::validate($wall());
foreach (['glass','wood','stone','metal'] as $type) WallCubes::validate($wall(['wallType'=>$type]));
foreach ([1, 15, 999] as $stamina) WallCubes::validate($wall(['wallStamina'=>$stamina]));
WallCubes::validate($wall(['wallType'=>'stone','wallStamina'=>20]));
WallCubes::validate($wall([], [['column'=>10,'row'=>5,'broken'=>true,'rubble'=>'stone'],['column'=>10,'row'=>6,'broken'=>false]]));
summonRefused($wall(['wallType'=>'ice']), 'Invalid wall type', 'A type the book does not have');
foreach ([0, -3, 1000, 2.5, '15'] as $stamina) summonRefused($wall(['wallStamina'=>$stamina]), 'Wall Stamina must be a whole number', 'Stamina ' . json_encode($stamina));
summonRefused($wall([], [['column'=>10,'row'=>5,'broken'=>'yes']]), 'Invalid wall cube flag', 'A broken mark that is not true or false');
summonRefused($wall([], [['column'=>10,'row'=>5,'broken'=>true,'rubble'=>'lava']]), 'Invalid wall cube rubble', 'Rubble of a material the app does not have');
echo "PASS a summoned wall may carry a type, a Stamina, and broken cubes\n";

// ---- what it takes to break one --------------------------------------------------------
summonCheck(WallCubes::stamina($wall()) === null, 'A wall given neither is not breakable');
summonCheck(array_map(static fn ($type) => WallCubes::stamina($wall(['wallType'=>$type])), ['glass','wood','stone','metal']) === [1, 3, 6, 9], 'A type is shorthand for the book\'s number');
summonCheck(WallCubes::stamina($wall(['wallStamina'=>15])) === 15 && WallCubes::stamina($wall(['wallType'=>'wood','wallStamina'=>15])) === 15, 'A stated Stamina is used as it is, over the type');
summonCheck(WallCubes::stamina($wall(['wallColor'=>'fire','wallType'=>'wood'])) === null && WallCubes::stamina($wall(['wallColor'=>'red','wallStamina'=>5])) === null, 'Fire is never breakable, whatever it is given');
// The heap a broken cube leaves: its type, or else what its colour says it is.
foreach ([[['wallType'=>'glass','wallColor'=>'stone'], 'glass'], [['wallStamina'=>15], 'stone'], [['wallStamina'=>15,'wallColor'=>'metal'], 'metal'], [['wallStamina'=>15,'wallColor'=>'ice'], 'glass'], [['wallStamina'=>15,'wallColor'=>'blue'], 'glass'], [['wallStamina'=>15,'wallColor'=>'dirt'], 'wood'], [['wallStamina'=>15,'wallColor'=>'green'], 'wood']] as [$extra, $rubble])
    summonCheck(WallCubes::rubble($wall($extra)) === $rubble, 'Rubble for ' . json_encode($extra) . ' is ' . $rubble);
// The walls the app makes from the cubes.
$edges = static fn (array $template) => WallCubes::withTemplates([], [$template])['environment']['walls']['value']['segments'];
$plain = $edges($wall());
summonCheck(count($plain) === 12 && !isset($plain[0]['stamina'], $plain[0]['group'], $plain[0]['material']), 'An unbreakable wall\'s cubes are plain walls, as before');
$stone = $edges($wall(['wallType'=>'stone']));
summonCheck($stone[0]['stamina'] === 6 && $stone[0]['material'] === 'stone' && $stone[0]['breakLabel'] === 'stone' && $stone[0]['group'] === 'template-cube:summoned:10,5,0', 'A stone wall\'s cube: Stamina 6, one group for its four sides: ' . json_encode(array_intersect_key($stone[0], ['stamina'=>1,'material'=>1,'group'=>1,'breakLabel'=>1])));
summonCheck(count(array_unique(array_column($stone, 'group'))) === 3, 'Each cube is its own object');
summonCheck($edges($wall(['wallStamina'=>15,'wallColor'=>'ice']))[0]['breakLabel'] === 'Stamina 15', 'A wall with a number is named by its number');
$half = $edges($wall(['wallType'=>'stone'], [['column'=>10,'row'=>5,'broken'=>true,'rubble'=>'stone'],['column'=>10,'row'=>6]]));
summonCheck(count($half) === 4 && $half[0]['group'] === 'template-cube:summoned:10,6,0', 'A broken cube makes no walls');
summonCheck(count(WallCubes::withTemplates([], [$wall(['wallType'=>'stone'], [['column'=>10,'row'=>5,'broken'=>true,'rubble'=>'stone']])])['environment']['walls']['value']['roofs']) === 0, 'and has no top to stand on');
echo "PASS a type or a number makes each cube one breakable object; fire never; a broken cube stops nothing\n";

// ---- pushed into one -----------------------------------------------------------------------
$through = static fn (array $template, array $from, int $column, int $row) => ForcedMovement::through($from, ['column'=>$column, 'row'=>$row], [$from], WallCubes::withTemplates([], [$template]));
$plan = $through($wall(['wallType'=>'wood']), $token(8, 5), 13, 5);
summonCheck(count($plan['breaks']) === 4 && $plan['breakCost'] === 3 && $plan['breakDamage'] === 5 && $plan['column'] == 10, 'A wooden cube: 3 squares of the push, 5 damage, all four sides, and on through: ' . json_encode([count($plan['breaks']), $plan['breakCost'], $plan['breakDamage'], $plan['column']]));
summonCheck($plan['steps'][0]['materials'] === ['wood'=>1], 'The pop-up names the type');
$plan = $through($wall(['wallStamina'=>15]), $token(8, 5), 23, 5);
summonCheck($plan['breaks'] === [] && $plan['wall'] === true, 'Stamina 15 with 14 squares left does not break');
$plan = $through($wall(['wallStamina'=>15]), $token(8, 5), 24, 5);
summonCheck($plan['breakCost'] === 15 && $plan['breakDamage'] === 17 && $plan['steps'][0]['materials'] === ['Stamina 15'=>1], 'With 15 left it breaks: 15 squares, and 15 plus 2 damage: ' . json_encode([$plan['breakCost'], $plan['breakDamage'], $plan['steps']]));
$plan = $through($wall(['wallType'=>'glass']), $token(8, 5, 2), 11, 5);
summonCheck(count($plan['breaks']) === 8 && $plan['breakCost'] === 2 && $plan['breakDamage'] === 6, 'A large creature against two glass cubes breaks both, and pays for both');
summonCheck($through($wall(), $token(8, 5), 40, 5)['breaks'] === [] && $through($wall(['wallColor'=>'fire','wallStamina'=>1]), $token(8, 5), 40, 5)['breaks'] === [], 'A wall given nothing, and fire, never break');
// The book's table and a stated number are one rule: the cost is the Stamina, the damage 2 more.
foreach (WallObjects::STAMINA as $material => $stamina) summonCheck(ForcedMovement::BREAK_DAMAGE[$material] === $stamina + ForcedMovement::BREAK_EXTRA, "The book's $material row is its Stamina plus 2");
echo "PASS a push breaks a cube for its Stamina in squares and that plus 2 in damage\n";

// ---- through the real store ------------------------------------------------------------------
$database = sys_get_temp_dir() . '/vtt-summoned-' . bin2hex(random_bytes(6)) . '.sqlite';
try {
    $store = new SyncV2Store($database);
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[[...$token(8, 5), 'name'=>'t','team'=>'ally','profileId'=>'cal']]]]);
    $template = static function (string $operation, array $entry, string $actor) use ($store) {
        $snap = $store->getSnapshot(); $current = $snap['state']['templates']['scene'][$entry['id']] ?? null;
        return $store->acceptBoardDomainCommand(['type'=>'template.upsert','operationId'=>$operation,'sceneId'=>'scene','entityId'=>$entry['id'],'baseRevision'=>$snap['revision'],
            'entityRevision'=>(int) ($current['_entityRevision'] ?? 0),'payload'=>['template'=>$entry]], $actor, $actor === 'gm');
    };
    $stored = static fn () => $store->getSnapshot()['state']['templates']['scene']['summoned'];
    // A player's ability makes a stone wall: the type comes with it, from the ability's own data.
    summonCheck($template('summon-stone-wall', $wall(['wallType'=>'stone','wallColor'=>'stone','authorId'=>'cal']), 'cal')['status'] === 'accepted', 'A player\'s ability may make a wall with a type');
    summonCheck($stored()['wallType'] === 'stone' && $stored()['authorId'] === 'cal', 'It is stored with the type');
    // The player is not sent the type back, and an edit of theirs does not lose or change it.
    summonCheck(!array_key_exists('wallType', WallCubes::forPlayer($stored())) && WallCubes::forPlayer($stored())['squares'] === $stored()['squares'], 'A player is sent the wall without what it takes to break it');
    $moved = WallCubes::forPlayer($stored()); unset($moved['_entityRevision']); $moved['squares'][2] = ['column'=>10,'row'=>8];
    $template('summon-player-edit', $moved, 'cal');
    summonCheck($stored()['wallType'] === 'stone' && $stored()['squares'][2]['row'] === 8, 'The player moves a cube, and the wall keeps its type');
    $template('summon-player-cheat', [...$moved, 'wallType'=>'glass','wallStamina'=>1], 'cal');
    summonCheck($stored()['wallType'] === 'stone' && !array_key_exists('wallStamina', $stored()), 'A player cannot change what it takes to break a wall once it stands');
    // The GM gives it a number instead.
    $gm = $stored(); unset($gm['_entityRevision']);
    $template('summon-gm-stamina', [...$gm, 'wallStamina'=>4], 'gm');
    summonCheck($stored()['wallStamina'] === 4, 'The GM sets a Stamina afterwards');

    // Asked first, then pushed through: Stamina 4, so 4 of the 6 squares left, and 6 damage.
    $offer = $store->forcedBreakOffer('scene', 't', ['column'=>15, 'row'=>5], false);
    summonCheck($offer['destination'] == ['column'=>11, 'row'=>5] && $offer['breakDamage'] === 6 && $offer['steps'][0] === ['materials'=>['Stamina 4'=>1], 'cost'=>4, 'damage'=>6, 'left'=>6], 'The offer for a player\'s push: ' . json_encode($offer));
    $before = $store->getSnapshot();
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'summon-push-through','sceneId'=>'scene','entityId'=>'t','baseRevision'=>$before['revision'],'entityRevision'=>0,
        'payload'=>['column'=>11,'row'=>5,'movementKind'=>'forced','forcedDestination'=>['column'=>15,'row'=>5,'breakThrough'=>true]]], 'cal', false);
    $events = $store->replayAfter($before['revision'])['events'];
    summonCheck(array_column($events, 'type') === ['template.updated', 'token.moved'] && $events[0]['entityId'] === 'summoned', 'Every browser hears the cube break, then the move: ' . json_encode(array_column($events, 'type')));
    $after = $stored();
    summonCheck($after['squares'][0] === ['column'=>10,'row'=>5,'broken'=>true,'rubble'=>'stone'] && !isset($after['squares'][1]['broken']) && count($after['squares']) === 3, 'The cube is kept, marked broken, with its rubble; the others stand: ' . json_encode($after['squares']));
    summonCheck($after['_entityRevision'] === $before['state']['templates']['scene']['summoned']['_entityRevision'] + 1, 'The wall has a new revision, so an edit made from an old copy is refused');
    $records = array_column($store->collisionEffects(['operationId'=>'summon-push-through'], 'gm', true), 'amount', 'targetId');
    summonCheck($records == ['t'=>6], 'The pushed creature takes Stamina plus 2: ' . json_encode($records));
    // The gap is open to walk through; the cube beside it still stands.
    $snap = $store->getSnapshot(); $t = $snap['state']['placements']['scene']['t'];
    $walk = static function (int $column, int $row, string $operation) use ($store) {
        $snap = $store->getSnapshot(); $t = $snap['state']['placements']['scene']['t'];
        try { return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$operation,'sceneId'=>'scene','entityId'=>'t','baseRevision'=>$snap['revision'],'entityRevision'=>$t['_entityRevision'],'payload'=>['column'=>$column,'row'=>$row,'movementKind'=>'walk']], 'cal', false)['status']; }
        catch (InvalidArgumentException $error) { return $error->getMessage(); }
    };
    summonCheck($walk(9, 5, 'summon-walk-back') === 'accepted', 'A player walks back through the broken cube');
    summonCheck($walk(9, 6, 'summon-walk-down') === 'accepted' && $walk(10, 6, 'summon-walk-into') === 'Movement blocked by a wall or closed door/window.', 'and is still stopped by the cube beside it');
    // The GM breaks a cube by hand: the server gives it its rubble.
    $gm = $stored(); unset($gm['_entityRevision']); $gm['squares'][1]['broken'] = true;
    $template('summon-gm-break', $gm, 'gm');
    summonCheck($stored()['squares'][1] === ['column'=>10,'row'=>6,'broken'=>true,'rubble'=>'stone'], 'Broken by hand, a cube gets the same rubble');
    // And repairs one.
    $gm = $stored(); unset($gm['_entityRevision']); unset($gm['squares'][0]['broken']);
    $template('summon-gm-repair', $gm, 'gm');
    summonCheck($stored()['squares'][0] === ['column'=>10,'row'=>5], 'Repaired, it is a cube again with no leftover rubble');
    unset($store);
} finally { @unlink($database); }
echo "PASS through the store: set by an ability or the GM, hidden from players, broken by a push, kept as rubble\n";
