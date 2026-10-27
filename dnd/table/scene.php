<?php
declare(strict_types=1);
/**
 * "Show to players" from the Table's scene list without the map open (Brandon, October 27, 2026: a button opens only
 * the thing asked for). The same routing.set the map's own Show-to-players sends (scene-manager.js
 * setPlayerMapForScene), applied and published the way api/v2/commands.php does it. Director only.
 *   POST {sceneId}  → {success, sceneId}
 * The scene's player visibility (scenes.json) is set by the page first through the map's own scenes endpoint.
 */
require_once __DIR__ . '/../vtt/api/v2/_common.php';
require_once __DIR__ . '/../vtt/lib/SyncV2PusherTransport.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'Method not allowed.']);
    }
    $auth = vttSyncV2RequireGm('Only the Director moves the players.');
    $body = vttSyncV2ReadJson();
    $sceneId = trim((string) ($body['sceneId'] ?? ''));
    $scene = null;
    foreach (loadVttScenes()['items'] as $item) {
        if (($item['id'] ?? null) === $sceneId) { $scene = $item; break; }
    }
    if ($scene === null) {
        vttSyncV2Respond(404, ['success' => false, 'error' => 'That scene was not found.']);
    }
    if (!vttSyncV2DomainEnabled('routing')) {
        vttSyncV2Respond(409, ['success' => false, 'error' => 'Open the map to move the players to a scene.']);
    }
    $store = vttSyncV2Store();
    $routing = [
        'playerMapDisabled' => false,
        'playerActiveSceneId' => $sceneId,
        'playerMapUrl' => $scene['mapUrl'] ?? null,
        'playerThumbnailUrl' => $scene['thumbnailUrl'] ?? null,
    ];
    // Read the routing's revision and apply; one more try if the map changed it in between.
    $result = null;
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $snapshot = $store->getSnapshot();
        $current = is_array($snapshot['state']['routing'] ?? null) ? $snapshot['state']['routing'] : [];
        $result = $store->acceptBoardDomainCommand([
            'operationId' => 'table-show-' . bin2hex(random_bytes(8)),
            'type' => 'routing.set',
            'baseRevision' => (int) ($snapshot['revision'] ?? 0),
            'entityRevision' => max(0, (int) ($current['_revision'] ?? 0)),
            'sceneId' => null,
            'entityId' => null,
            'payload' => ['routing' => $routing],
        ], (string) ($auth['user'] ?? 'GM'), true);
        if (($result['status'] ?? '') !== 'conflict') break;
    }
    if (($result['status'] ?? '') === 'conflict') {
        vttSyncV2Respond(409, ['success' => false, 'error' => 'The map was busy; try again.']);
    }
    $event = $result['event'] ?? null;
    if (is_array($event) && empty($result['idempotent'])) {
        SyncV2PusherTransport::publishAudiences($event, vttSyncV2ProjectEventForUser($event, ['isGM' => false]), null);
    }
    vttSyncV2Respond(200, ['success' => true, 'sceneId' => $sceneId]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
