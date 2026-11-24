<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../lib/SyncV2Store.php';

$roster = tmpfile();
fwrite($roster, '["zepha","cal"]');
fflush($roster);
putenv('VTT_PLAYER_ROSTER_PATH=' . stream_get_meta_data($roster)['uri']);
$store = new SyncV2Store(':memory:', 'turn-delivery');
$store->migrateLegacyPlacements(['placements' => ['arena' => [
    ['id' => 'hero', 'team' => 'ally', 'metadata' => ['profileId' => 'Zepha']],
    ['id' => 'practice-dummy', 'team' => 'ally', 'metadata' => ['testDummy' => []]],
]]]);

function command(SyncV2Store $store, string $type, string $actor, array $payload): array
{
    $revision = $store->getSnapshot()['revision'];
    $result = $store->acceptCombatCommand([
        'type' => $type, 'operationId' => 'delivery-' . $revision, 'sceneId' => 'arena',
        'baseRevision' => $revision, 'payload' => $payload,
    ], $actor, $actor === 'GM');
    if ($result['status'] !== 'accepted') {
        throw new RuntimeException('Unexpected ' . $type . ' result: ' . json_encode($result));
    }
    return $result['event']['payload']['transition'];
}

function checkDelivery(SyncV2Store $store, string $actor, ?string $recipient, string $token = 'hero'): void
{
    $payload = ['combatantId' => $token];
    $transition = command($store, 'turn.start', $actor, $payload);
    if (($transition['turnStartResourceRecipientId'] ?? null) !== $recipient
        || $transition['interactionOwnerId'] !== $actor) {
        throw new RuntimeException('Unexpected delivery or turn owner: ' . json_encode($transition));
    }
    command($store, 'turn.cancel', $actor, $payload);
}

command($store, 'combat.start', 'GM', ['startingTeam' => 'ally']);
checkDelivery($store, 'GM', 'gm');         // A solo Director starts a player's turn.
checkDelivery($store, 'zepha', 'zepha');   // Starting one's own turn establishes presence for this decision.
checkDelivery($store, 'cal', 'zepha');     // A teammate cannot collect the hero's offer when both seats are away.
$store->touchPresence('GM', true);
checkDelivery($store, 'cal', 'gm');        // A teammate starts the turn while only the Director is present.
$store->touchPresence('Zepha', false);
checkDelivery($store, 'GM', 'zepha');      // A connected player takes precedence over the Director.
checkDelivery($store, 'GM', null, 'practice-dummy');
echo "Turn start routed to the intended seat in all six cases.\n";
