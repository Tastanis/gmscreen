<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/SyncV2PusherTransport.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        vttSyncV2Respond(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }

    $command = vttSyncV2ReadJson();
    $type = (string) ($command['type'] ?? '');
    if ($type === 'token.move' && vttSyncV2DomainEnabled('token_movement')) {
        $auth = vttSyncV2RequireAuthenticated();
        $sceneId = trim((string) ($command['sceneId'] ?? ''));
        $placementId = trim((string) ($command['entityId'] ?? $command['payload']['placementId'] ?? ''));
        $placement = vttSyncV2FindLegacyPlacement($sceneId, $placementId);
        if ($placement === null) {
            vttSyncV2Respond(404, ['success' => false, 'error' => 'Placement not found.']);
        }
        if (!vttSyncV2CanMovePlacement($auth, $sceneId, $placementId, $placement)) {
            vttSyncV2Respond(403, ['success' => false, 'error' => 'You cannot move this token.']);
        }
        $result = vttSyncV2Store()->acceptTokenMove($command, (string) ($auth['user'] ?? ''), $placement);
    } else {
        $auth = vttSyncV2RequireShadowGm();
        $result = vttSyncV2Store()->acceptShadowCommand(
            $command,
            (string) ($auth['user'] ?? 'GM')
        );
    }

    if ($result['status'] === 'conflict') {
        $conflictSnapshot = $result['snapshot'] ?? null;
        if ($type === 'token.move' && is_array($conflictSnapshot)) {
            $conflictSnapshot = vttSyncV2ProjectSnapshotForUser($conflictSnapshot, $auth);
        }
        vttSyncV2Respond(409, [
            'success' => false,
            'error' => $result['error'] ?? 'revision_conflict',
            'snapshot' => $conflictSnapshot,
        ]);
    }

    $event = $result['event'] ?? null;
    if (is_array($event) && empty($result['idempotent'])) {
        $socketId = isset($command['socketId']) && is_string($command['socketId'])
            ? trim($command['socketId'])
            : null;
        $socketId = $socketId === '' ? null : $socketId;
        if ($type === 'token.move') {
            // Only already-player-visible movement may use the shared board
            // channel. Hidden movement remains available solely through the
            // authenticated, redacted HTTP recovery projection.
            if (!vttSyncV2PlacementHidden($placement)) {
                SyncV2PusherTransport::publishPublic($event, $socketId);
            }
        } else {
            SyncV2PusherTransport::publish($event, $socketId);
        }
    }

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => $type === 'token.move' ? 'live' : 'shadow',
        'idempotent' => (bool) ($result['idempotent'] ?? false),
        'event' => $event,
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
