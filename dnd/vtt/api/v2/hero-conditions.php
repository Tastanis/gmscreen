<?php
declare(strict_types=1);

// A hero's conditions on its token, for the character sheet page (October 2026: one list for the sheet and the token;
// lib/HeroConditions.php says how).
//   GET  ?character=cal                      → {success, onMap, sceneId, placementId, entityRevision, conditions}
//   POST {character, op: add|remove, condition: {name, duration: {type}}, operationId}
//                                            → the same view after the change; onMap false: no token, nothing changed
// The change is the signed-in user's own placement.batch, published to the map like any other.

require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/SyncV2PusherTransport.php';
require_once __DIR__ . '/../../lib/HeroConditions.php';

try {
    $auth = vttSyncV2RequireAuthenticated();
    $isGm = (bool) ($auth['isGM'] ?? false);
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $body = $method === 'POST' ? vttSyncV2ReadJson() : $_GET;
    $character = strtolower(trim((string) ($body['character'] ?? '')));
    if ($character === '' || !in_array($character, PlayerRoster::playerIds(), true)) {
        vttSyncV2Respond(422, ['success' => false, 'error' => 'Unknown hero.']);
    }
    if (!vttSyncV2DomainEnabled('placements')) {
        // Tokens are not on the live store: the sheet keeps its own list.
        vttSyncV2Respond(200, ['success' => true, 'onMap' => false]);
    }
    $hidden = static fn (array $placement, array $sceneConfig): bool => vttSyncV2PlacementHiddenForPlayer($placement, $sceneConfig);

    if ($method === 'GET') {
        $store = vttSyncV2Store();
        vttSyncV2Respond(200, ['success' => true] + HeroConditions::view(HeroConditions::find($store, $store->getSnapshot(), $character, $isGm, $hidden)));
    }
    if ($method !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'Method not allowed.']);
    }

    $operationId = trim((string) ($body['operationId'] ?? ''));
    if (strlen($operationId) < 8 || strlen($operationId) > 120 || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1) {
        vttSyncV2Respond(422, ['success' => false, 'error' => 'operationId is invalid.']);
    }
    $result = HeroConditions::change(
        vttSyncV2Store(),
        $character,
        (string) ($body['op'] ?? ''),
        is_array($body['condition'] ?? null) ? $body['condition'] : [],
        $operationId,
        (string) ($auth['user'] ?? ''),
        $isGm,
        $hidden
    );
    $event = $result['event'];
    if (is_array($event) && $result['applied']) {
        SyncV2PusherTransport::publishAudiences($event, vttSyncV2ProjectEventForUser($event, ['isGM' => false]), null);
    }
    vttSyncV2Respond(200, ['success' => true, 'applied' => $result['applied']] + $result['view']);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
