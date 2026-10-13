<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Thorn in foot, isnt triggering the damage when things move."
//
// Build 490 keeps the watch an ability sets ("when the target moves") on the caster's own token, as
// `runtimeTriggers`, so that whichever page moves the target knows of it. The page's side is
// assets/js/ui/__tests__/shared-watches.test.mjs. This is the path that test did not take: a PLAYER's page puts
// the watch on its hero's token through the server, the Director's page must receive it whole, and the player's
// page must be able to take it off again.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function watchCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$token = static fn (string $id, int $column, string $team, array $extra = []) => ['id'=>$id, 'name'=>$id, 'column'=>$column, 'row'=>3, 'width'=>1, 'height'=>1, 'team'=>$team, ...$extra];
$watch = ['abilityId'=>'thorn-in-foot', 'eventType'=>'movement', 'casterId'=>'cal', 'targetIds'=>['ogre'], 'autoResolve'=>true,
    'effects'=>[['type'=>'damage', 'amountFrom'=>'movement', 'damageType'=>'psychic']], 'lifetimeState'=>['kind'=>'endOfCasterNextTurn', 'turnsSeen'=>0]];

$database = sys_get_temp_dir() . '/vtt-watches-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[$token('cal', 2, 'ally', ['profileId'=>'cal']), $token('ogre', 6, 'enemy')]]]);
    $patch = static function (string $operation, string $placementId, array $fields, string $actor, bool $gm = false) use ($store): array {
        $snap = $store->getSnapshot();
        return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>$operation,'baseRevision'=>$snap['revision'],'payload'=>['actions'=>[
            ['kind'=>'patch','sceneId'=>'scene','placementId'=>$placementId,'entityRevision'=>$snap['state']['placements']['scene'][$placementId]['_entityRevision'] ?? 0,'patch'=>$fields]]]], $actor, $gm);
    };
    $held = static fn (string $id) => $store->getSnapshot()['state']['placements']['scene'][$id];

    // Cal's player uses Thorn In Foot: his page puts the watch on his hero's token.
    $revision = $store->getSnapshot()['revision'];
    $set = $patch('watch-set-0001', 'cal', ['runtimeTriggers'=>[$watch]], 'cal');
    watchCheck($set['status'] === 'accepted', 'A player\'s page may put a watch on its hero\'s token: ' . json_encode($set['error'] ?? $set['status']));
    watchCheck($held('cal')['runtimeTriggers'] === [$watch], 'and it is kept whole, every field: ' . json_encode($held('cal')['runtimeTriggers'] ?? null));
    // What every other page is sent: the change, with the watch in it.
    $events = $store->replayAfter($revision)['events'];
    $sent = json_encode($events);
    watchCheck(count($events) === 1 && str_contains($sent, '"runtimeTriggers"') && str_contains($sent, '"thorn-in-foot"') && str_contains($sent, '"amountFrom":"movement"'), 'The change every page receives carries the watch: ' . substr($sent, 0, 300));

    // The Director moves the ogre (his page answers for the watch); nothing about the move disturbs the watch.
    $snap = $store->getSnapshot();
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'watch-ogre-moves','sceneId'=>'scene','entityId'=>'ogre','baseRevision'=>$snap['revision'],
        'entityRevision'=>$snap['state']['placements']['scene']['ogre']['_entityRevision'] ?? 0,'payload'=>['column'=>8,'row'=>3]], 'gm', true);
    watchCheck($held('cal')['runtimeTriggers'] === [$watch], 'The target moving leaves the watch where it is');

    // "1 damage for each square they move": a walk round corners carries its corners to every page, so the
    // squares walked can be counted, not only the squares between its two ends (Build 502).
    $snap = $store->getSnapshot(); $revision = $snap['revision'];
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'watch-ogre-corners','sceneId'=>'scene','entityId'=>'ogre','baseRevision'=>$snap['revision'],
        'entityRevision'=>$snap['state']['placements']['scene']['ogre']['_entityRevision'] ?? 0,
        'payload'=>['column'=>10,'row'=>3,'movementKind'=>'walk','path'=>[['column'=>8,'row'=>6],['column'=>10,'row'=>6]]]], 'gm', true);
    $walked = $store->replayAfter($revision)['events'][0];
    watchCheck(($walked['payload']['path'] ?? null) === [['column'=>8,'row'=>6],['column'=>10,'row'=>6]], 'The corners of a walk travel with the move: ' . json_encode($walked['payload']['path'] ?? null));
    $receipt = end($walked['payload']['_movementUndo']['history']);
    watchCheck(($receipt['operationId'] ?? null) === 'watch-ogre-corners' && (float) $receipt['from']['column'] === 8.0,
        'and the receipt of the move says where it began, which is what an arrow press is counted from: ' . json_encode($receipt['from'] ?? null));
    $snap = $store->getSnapshot(); $revision = $snap['revision'];
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'watch-ogre-plain','sceneId'=>'scene','entityId'=>'ogre','baseRevision'=>$snap['revision'],
        'entityRevision'=>$snap['state']['placements']['scene']['ogre']['_entityRevision'] ?? 0,'payload'=>['column'=>11,'row'=>3]], 'gm', true);
    watchCheck(!array_key_exists('path', $store->replayAfter($revision)['events'][0]['payload']), 'A straight move carries no corners');

    // The Director's page ticks the watch on (a turn seen) and, when it has run out, takes it off.
    $ticked = [[...$watch, 'lifetimeState'=>['kind'=>'endOfCasterNextTurn', 'turnsSeen'=>1]]];
    watchCheck($patch('watch-tick-0001', 'cal', ['runtimeTriggers'=>$ticked], 'gm', true)['status'] === 'accepted' && $held('cal')['runtimeTriggers'][0]['lifetimeState']['turnsSeen'] === 1, 'The Director\'s page keeps the shared record in step');
    // Cal's own page may take it off too (the ability ended early).
    $off = $patch('watch-off-00001', 'cal', ['runtimeTriggers'=>null], 'cal');
    watchCheck($off['status'] === 'accepted' && empty($held('cal')['runtimeTriggers']), 'and the player\'s page may take it off: ' . json_encode($held('cal')['runtimeTriggers'] ?? null));

    // What a player's page may NOT do with it: forge the server's own fields along with a watch.
    foreach (['_movementUndo'=>[], 'hidden'=>true, 'team'=>'enemy'] as $field => $value) {
        try { $patch('watch-forge-' . substr(md5($field), 0, 8), 'cal', ['runtimeTriggers'=>[$watch], $field=>$value], 'cal'); watchCheck(false, "A player changed $field alongside a watch"); }
        catch (InvalidArgumentException $error) { watchCheck(empty($held('cal')['runtimeTriggers']), "A refused change leaves nothing behind ($field)"); }
    }
    unset($store);
} finally { @unlink($database); }

echo "shared watches: a player's page puts a watch on its hero's token, every page receives it whole, and it comes off again\n";
