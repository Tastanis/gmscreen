<?php
declare(strict_types=1);
// Brandon, October 2026: "Idk why you would have a condition that is in your character sheet and not in the vtt or
// vice versa. So probably merge them."
//
// The character sheet changes a hero's conditions on the hero's token while it is on the active scene
// (lib/HeroConditions.php, api/v2/hero-conditions.php): the user's own placement change, so the token's own rules
// hold. These run the store in a temporary database.
require_once __DIR__ . '/../../../lib/HeroConditions.php';
function heroConditionCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$database = sys_get_temp_dir() . '/vtt-hero-conditions-' . bin2hex(random_bytes(6)) . '.sqlite';
$rosterPath = $database . '.json';
$previous = getenv('VTT_PLAYER_ROSTER_PATH');
file_put_contents($rosterPath, json_encode(['rowan', 'cal']));
putenv('VTT_PLAYER_ROSTER_PATH=' . $rosterPath);
try {
    $store = new SyncV2Store($database);
    $board = [
        'activeSceneId' => 'scene',
        'placements' => [
            'scene' => [
                ['id' => 'rowan-token', 'name' => 'Rowan', 'profileId' => 'rowan', 'team' => 'ally', 'column' => 2, 'row' => 2,
                    'conditions' => [['name' => 'Prone', 'duration' => ['type' => 'save-ends']], ['name' => 'hiddenEffect', 'hidden' => true, 'label' => 'Curse', 'duration' => ['type' => 'save-ends']]]],
                ['id' => 'cal-token', 'name' => 'Cal', 'profileId' => 'cal', 'team' => 'ally', 'column' => 4, 'row' => 2, 'hidden' => true],
            ],
            'other' => [['id' => 'rowan-elsewhere', 'name' => 'Rowan', 'profileId' => 'rowan', 'team' => 'ally', 'column' => 1, 'row' => 1]],
        ],
        'sceneState' => ['scene' => [], 'other' => []],
    ];
    $store->migrateLegacyPlacements($board);
    $store->migrateLegacyBoardDomains($board);
    $token = static fn (string $id) => $store->getSnapshot()['state']['placements']['scene'][$id];
    $op = 0;
    $change = static function (string $character, string $kind, array $condition, string $user, bool $gm = false) use ($store, &$op) {
        return HeroConditions::change($store, $character, $kind, $condition, 'hero-cond-' . (++$op) . '-' . bin2hex(random_bytes(3)), $user, $gm);
    };

    // The sheet reads the token: where it is, its revision, its conditions without the Director's hidden effect.
    $view = HeroConditions::view(HeroConditions::find($store, $store->getSnapshot(), 'rowan', false));
    heroConditionCheck($view['onMap'] === true && $view['placementId'] === 'rowan-token' && $view['conditions'] === [['name' => 'Prone', 'duration' => ['type' => 'save-ends']]],
        'The sheet sees the hero token on the active scene and its shown conditions: ' . json_encode($view));

    // The player adds Slowed (EOT) on the sheet: it lands on the token, ending at the end of the hero's own turn.
    $result = $change('rowan', 'add', ['name' => 'Slowed', 'duration' => ['type' => 'end-of-turn']], 'rowan');
    $conditions = $token('rowan-token')['conditions'];
    $slowed = $conditions[2] ?? null;
    heroConditionCheck($result['applied'] === true && is_array($result['event']) && ($slowed['name'] ?? '') === 'Slowed'
        && ($slowed['duration'] ?? null) === ['type' => 'end-of-turn', 'targetTokenId' => 'rowan-token', 'targetTokenName' => 'Rowan'],
        'Slowed (EOT) reaches the token, naming its bearer: ' . json_encode($conditions));
    heroConditionCheck(count($conditions) === 3 && $conditions[1]['name'] === 'hiddenEffect', 'The token\'s other conditions, hidden ones too, are kept');
    heroConditionCheck($result['view']['conditions'] === [['name' => 'Prone', 'duration' => ['type' => 'save-ends']], ['name' => 'Slowed', 'duration' => ['type' => 'end-of-turn']]]
        && $result['view']['entityRevision'] === (int) $token('rowan-token')['_entityRevision'], 'The sheet is told the token\'s list and revision for its mirror');
    heroConditionCheck(!isset($store->getSnapshot()['state']['placements']['other']['rowan-elsewhere']['conditions']), 'A token on another scene is not the hero on the map');

    // The same again changes nothing (a retried click, or two pages).
    $revision = $token('rowan-token')['_entityRevision'];
    $again = $change('rowan', 'add', ['name' => 'slowed', 'duration' => ['type' => 'end-of-turn']], 'rowan');
    heroConditionCheck($again['applied'] === false && $token('rowan-token')['_entityRevision'] === $revision, 'A condition already there is not added twice');

    // Taken off on the sheet: gone from the token. The hidden effect cannot be named from a sheet.
    $removed = $change('rowan', 'remove', ['name' => 'Slowed', 'duration' => ['type' => 'end-of-turn']], 'rowan');
    $names = array_column($token('rowan-token')['conditions'], 'name');
    heroConditionCheck($removed['applied'] === true && $names === ['Prone', 'hiddenEffect'], 'Removed on the sheet, removed from the token: ' . json_encode($names));
    $refused = false;
    try { $change('rowan', 'remove', ['name' => 'hiddenEffect'], 'rowan'); } catch (InvalidArgumentException $error) { $refused = true; }
    heroConditionCheck($refused && count($token('rowan-token')['conditions']) === 2, 'A hidden effect is not a sheet condition');
    $nothing = $change('rowan', 'remove', ['name' => 'Dazed'], 'rowan');
    heroConditionCheck($nothing['applied'] === false, 'Taking off one the token does not have changes nothing');

    // The token's rules: another player may change a token they can see, as on the map; nobody but the Director
    // reaches a hidden one, and a hero hidden from the sheet is "not on the map" (the sheet keeps its own list).
    $byOther = $change('rowan', 'add', ['name' => 'Dazed'], 'cal');
    heroConditionCheck($byOther['applied'] === true, 'Another player may add a condition to a visible hero token, as on the map');
    $hidden = $change('cal', 'add', ['name' => 'Dazed'], 'cal');
    heroConditionCheck($hidden['view'] === ['onMap' => false] && !isset($token('cal-token')['conditions']), 'A hidden hero token is not changed from the sheet: ' . json_encode($hidden['view']));

    // A stale snapshot is read again: a change made meanwhile is kept, never overwritten.
    $snapshot = $store->getSnapshot();
    $store->acceptPlacementBatch(['type' => 'placement.batch', 'operationId' => 'meanwhile-0001', 'baseRevision' => $snapshot['revision'], 'payload' => ['actions' => [[
        'kind' => 'patch', 'sceneId' => 'scene', 'placementId' => 'rowan-token', 'entityRevision' => $token('rowan-token')['_entityRevision'],
        'patch' => ['conditions' => [...$token('rowan-token')['conditions'], ['name' => 'Bleeding', 'duration' => ['type' => 'save-ends']]]],
    ]]]], 'GM', true);
    $change('rowan', 'add', ['name' => 'Weakened'], 'rowan');
    $names = array_column($token('rowan-token')['conditions'], 'name');
    heroConditionCheck($names === ['Prone', 'hiddenEffect', 'Dazed', 'Bleeding', 'Weakened'], 'Changes made elsewhere stay: ' . json_encode($names));

    // Nothing on the active scene: not on the map.
    $store2 = new SyncV2Store(':memory:');
    $store2->migrateLegacyBoardDomains(['activeSceneId' => 'empty', 'sceneState' => ['empty' => []]]);
    heroConditionCheck(HeroConditions::change($store2, 'rowan', 'add', ['name' => 'Slowed'], 'hero-cond-empty-1', 'rowan', false)['view'] === ['onMap' => false], 'No token: nothing changed, the sheet keeps its own list');
    // Late October 2026: the hero's token is the one on the players' scene first, else the Director's open scene.
    foreach ([false, true] as $playerMapDisabled) {
        $store3 = new SyncV2Store(':memory:');
        $board3 = [
            'activeSceneId' => 'director', 'playerActiveSceneId' => 'players', 'playerMapDisabled' => $playerMapDisabled,
            'placements' => [
                'director' => [['id' => 'cal-d', 'name' => 'Cal', 'profileId' => 'cal', 'team' => 'ally', 'column' => 1, 'row' => 1],
                    ['id' => 'rowan-d', 'name' => 'Rowan', 'profileId' => 'rowan', 'team' => 'ally', 'column' => 2, 'row' => 1]],
                'players' => [['id' => 'cal-p', 'name' => 'Cal', 'profileId' => 'cal', 'team' => 'ally', 'column' => 1, 'row' => 1]],
            ],
            'sceneState' => ['director' => [], 'players' => []],
        ];
        $store3->migrateLegacyPlacements($board3);
        $store3->migrateLegacyBoardDomains($board3);
        $found = HeroConditions::find($store3, $store3->getSnapshot(), 'cal', false);
        $want = $playerMapDisabled ? ['director', 'cal-d'] : ['players', 'cal-p'];
        heroConditionCheck([$found['sceneId'] ?? '', $found['placementId'] ?? ''] === $want, 'The hero\'s token is on the players\' scene first (none when the players see no map): ' . json_encode($found ? [$found['sceneId'], $found['placementId']] : null));
        heroConditionCheck((HeroConditions::find($store3, $store3->getSnapshot(), 'rowan', false)['placementId'] ?? '') === 'rowan-d', 'Not on the players\' scene: the Director\'s open scene');
        $added = HeroConditions::change($store3, 'cal', 'add', ['name' => 'Slowed'], 'hero-cond-order-' . (int) $playerMapDisabled, 'cal', false);
        $placements = $store3->getSnapshot()['state']['placements'];
        $other = $playerMapDisabled ? ['players', 'cal-p'] : ['director', 'cal-d'];
        heroConditionCheck($added['view']['onMap'] === true && $added['view']['placementId'] === $want[1]
            && isset($placements[$want[0]][$want[1]]['conditions']) && !isset($placements[$other[0]][$other[1]]['conditions']),
            'The sheet\'s change lands on that token only');
        unset($store3);
    }

    $unknown = false;
    try { HeroConditions::change($store, 'rowan', 'toggle', ['name' => 'Slowed'], 'hero-cond-bad-1', 'rowan', false); } catch (InvalidArgumentException $error) { $unknown = true; }
    heroConditionCheck($unknown, 'Only add and remove');
    echo "hero-conditions: ok\n";
} finally {
    if ($previous === false) putenv('VTT_PLAYER_ROSTER_PATH'); else putenv('VTT_PLAYER_ROSTER_PATH=' . $previous);
    unset($store, $store2);
    gc_collect_cycles();
    @unlink($database);
    @unlink($database . '-wal');
    @unlink($database . '-shm');
    @unlink($rosterPath);
}
