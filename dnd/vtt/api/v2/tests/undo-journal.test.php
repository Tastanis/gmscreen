<?php
declare(strict_types=1);
// Turn undo (Brandon, October 2026): during a running turn every change by anyone is kept with what it was before;
// Ctrl+Z (anyone, even a player for an enemy token) takes back the newest action, Ctrl+Shift+Z the whole turn. A
// step whose token changed again since is left alone. Outside a turn nothing is kept.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function undoCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$database = sys_get_temp_dir() . '/vtt-undo-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $hero = ['id' => 'cal', 'name' => 'Cal', 'profileId' => 'cal', 'combatTeam' => 'ally', 'team' => 'ally', 'column' => 1, 'row' => 1, 'width' => 1, 'height' => 1, 'levelId' => 'level-0', 'hp' => ['current' => '30', 'max' => '30']];
    $goblin = ['id' => 'gob', 'name' => 'Goblin', 'combatTeam' => 'enemy', 'team' => 'enemy', 'column' => 5, 'row' => 1, 'width' => 1, 'height' => 1, 'levelId' => 'level-0', 'hp' => ['current' => '10', 'max' => '10'], 'conditions' => []];
    $store->migrateLegacyPlacements(['placements' => ['scene' => [$hero, $goblin]]]);
    $n = 0;
    $combat = static function (string $type, array $payload, string $actor = 'GM') use ($store, &$n) {
        return $store->acceptCombatCommand(['operationId' => 'undo-combat-' . (++$n), 'type' => $type, 'baseRevision' => $store->getSnapshot()['revision'], 'sceneId' => 'scene', 'payload' => $payload], $actor, strtoupper($actor) === 'GM');
    };
    $patch = static function (string $id, array $fields, string $actor = 'GM', array $extra = []) use ($store, &$n) {
        $s = $store->getSnapshot();
        return $store->acceptPlacementBatch(['type' => 'placement.batch', 'operationId' => 'undo-patch-' . (++$n), 'baseRevision' => $s['revision'],
            'payload' => ['actions' => [['kind' => 'patch', 'sceneId' => 'scene', 'placementId' => $id, 'entityRevision' => $s['state']['placements']['scene'][$id]['_entityRevision'], 'patch' => $fields]], ...$extra]], $actor, strtoupper($actor) === 'GM');
    };
    $move = static function (string $id, int $column, string $actor) use ($store, &$n) {
        $s = $store->getSnapshot();
        return $store->acceptTokenMove(['type' => 'token.move', 'operationId' => 'undo-move-' . (++$n), 'sceneId' => 'scene', 'entityId' => $id, 'baseRevision' => $s['revision'],
            'entityRevision' => $s['state']['placements']['scene'][$id]['_entityRevision'], 'payload' => ['column' => $column, 'row' => 1, 'movementKind' => 'walk']], $actor, false);
    };
    $token = static fn (string $id) => $store->getSnapshot()['state']['placements']['scene'][$id];
    $undo = static function (string $actor, bool $whole = false) use ($store, &$n) { return $store->undoTurnSteps(['sceneId' => 'scene', 'operationId' => 'undo-op-' . (++$n)], $actor, $whole); };
    $refused = static function (callable $try): ?string { try { $try(); return null; } catch (InvalidArgumentException $error) { return $error->getMessage(); } };

    // Outside a turn nothing is kept.
    $patch('gob', ['hp' => ['current' => '9', 'max' => '10']]);
    undoCheck(str_contains((string) $refused(fn () => $undo('GM')), 'No turn'), 'No turn running: nothing to undo');

    $combat('combat.start', ['startingTeam' => 'ally', 'encounterId' => 'enc-undo', 'combat' => ['active' => true, 'malice' => 0, 'groups' => [], 'lastEffects' => []]]);
    $combat('turn.start', ['combatantId' => 'cal', 'holderName' => 'Cal'], 'GM');
    undoCheck(($store->getSnapshot()['state']['combat']['scene']['activeCombatantId'] ?? null) === 'cal', 'Cal\'s turn runs');

    // One ability use (one group): damage and a condition on the goblin. Then Cal walks (its own action).
    $patch('gob', ['hp' => ['current' => '4', 'max' => '10']], 'cal', ['undoGroup' => 'ug-strike', 'undoLabel' => 'Strike']);
    $patch('gob', ['conditions' => [['name' => 'Prone']]], 'cal', ['undoGroup' => 'ug-strike', 'undoLabel' => 'Strike']);
    $move('cal', 3, 'cal');
    undoCheck($token('cal')['column'] === 3 && $token('gob')['hp']['current'] === '4', 'The turn so far');
    undoCheck($store->undoTurnCount(['sceneId' => 'scene'])['actions'] === 2, 'Two actions to undo');

    // A different player undoes the newest action: the walk.
    $first = $undo('zepha');
    undoCheck($first['status'] === 'accepted' && $token('cal')['column'] === 1, 'Ctrl+Z by anyone takes back the walk: ' . json_encode($token('cal')['column']));
    undoCheck(count($first['undo']['steps']) === 1 && $first['undo']['steps'][0]['actorId'] === 'cal', 'The chat line is named for who did it');

    // Next: the whole Strike at once, on an enemy token, by a player.
    $second = $undo('zepha');
    undoCheck($token('gob')['hp']['current'] === '9' && $token('gob')['conditions'] === [], 'The Strike is undone as one: ' . json_encode($token('gob')));
    undoCheck($second['undo']['steps'][0]['label'] === 'Strike' && count($second['undo']['steps']) === 2, 'One step per change, one label');
    undoCheck(str_contains((string) $refused(fn () => $undo('GM')), 'Nothing left'), 'Nothing left to undo');

    // Changed again since (a change not kept, as an undo's own changes are not): left alone.
    $patch('gob', ['hp' => ['current' => '6', 'max' => '10']], 'cal', ['undoGroup' => 'ug-hit']);
    $patch('gob', ['hp' => ['current' => '2', 'max' => '10']], 'GM', ['undoReplay' => true]);
    $third = $undo('GM');
    undoCheck(count($third['undo']['skipped']) === 1 && $token('gob')['hp']['current'] === '2', 'A token changed again since is not put back');

    // Malice and a hero sheet change belong to the turn too; Ctrl+Shift+Z takes everything.
    $combat('combat.patch', ['patch' => ['maliceDelta' => 3], 'undoGroup' => 'ug-malice']);
    $store->recordSheetUndoStep(['sceneId' => 'scene', 'operationId' => 'sheet-op-1', 'payload' => ['characterId' => 'cal', 'counter' => 'resource', 'delta' => -2, 'characterName' => 'Cal', 'undoGroup' => 'ug-spend', 'undoLabel' => 'Burst']], 'cal');
    $move('cal', 4, 'cal');
    $malice = (int) $store->getSnapshot()['state']['combat']['scene']['malice'];
    $whole = $undo('GM', true);
    $kinds = array_column($whole['undo']['steps'], 'kind');
    undoCheck(in_array('malice', $kinds, true) && in_array('sheet', $kinds, true) && in_array('placement', $kinds, true), 'The whole turn: ' . json_encode($kinds));
    undoCheck((int) $store->getSnapshot()['state']['combat']['scene']['malice'] === $malice - 3 && $token('cal')['column'] === 1, 'Malice and the walk put back');
    undoCheck($store->undoTurnCount(['sceneId' => 'scene'])['actions'] === 0, 'Nothing left in the turn');

    // The turn ends: what follows is not kept.
    $combat('turn.complete', ['combatantId' => 'cal'], 'GM');
    $patch('gob', ['hp' => ['current' => '1', 'max' => '10']]);
    undoCheck(str_contains((string) $refused(fn () => $undo('GM')), 'No turn'), 'After the turn: nothing kept');
    echo "Turn undo journal: step, whole turn, anyone, changed-since, Malice, sheet, outside a turn passed.\n";
} finally {
    unset($store);
    gc_collect_cycles();
    foreach ([$database, $database . '-wal', $database . '-shm'] as $file) if (is_file($file)) unlink($file);
}
