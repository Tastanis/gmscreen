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
    $combatTypes = [
        'combat.start', 'turn.start', 'turn.complete', 'turn.cancel',
        'combat.uncomplete', 'round.advance', 'combat.end', 'combat.patch',
        'combat.automation.claim',
    ];
    $boardDomainFlags = [
        'template.upsert' => 'templates',
        'template.remove' => 'templates',
        'drawing.upsert' => 'drawings',
        'drawing.remove' => 'drawings',
        'ping.add' => 'pings',
        'fog.set' => 'fog',
        'levels.set' => 'levels',
        'level.user.set' => 'levels',
        'level.activate' => 'levels',
        'grid.set' => 'grid',
        'scene.activate' => 'scenes',
        'routing.set' => 'routing',
    ];
    $isBoardDomainCommand = isset($boardDomainFlags[$type])
        && vttSyncV2DomainEnabled($boardDomainFlags[$type]);
    if ($isBoardDomainCommand) {
        $auth = vttSyncV2RequireAuthenticated();
        $result = vttSyncV2Store()->acceptBoardDomainCommand(
            $command,
            (string) ($auth['user'] ?? ''),
            (bool) ($auth['isGM'] ?? false)
        );
    } elseif (in_array($type, $combatTypes, true) && vttSyncV2DomainEnabled('combat')) {
        $auth = vttSyncV2RequireAuthenticated();
        $result = vttSyncV2Store()->acceptCombatCommand(
            $command,
            (string) ($auth['user'] ?? ''),
            (bool) ($auth['isGM'] ?? false)
        );
    } elseif ($type === 'placement.batch' && vttSyncV2DomainEnabled('placements')) {
        $auth = vttSyncV2RequireAuthenticated();
        $result = vttSyncV2Store()->acceptPlacementBatch(
            $command,
            (string) ($auth['user'] ?? ''),
            (bool) ($auth['isGM'] ?? false)
        );
    } elseif ($type === 'token.move' && vttSyncV2DomainEnabled('token_movement')) {
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
        if (
            (
                $isBoardDomainCommand
                || in_array($type, ['token.move', 'placement.batch'], true)
                || in_array($type, $combatTypes, true)
            )
            && is_array($conflictSnapshot)
        ) {
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
        if ($isBoardDomainCommand) {
            // Phase 6 payloads contain no hidden placement identity. They
            // travel over the existing board event transport; HTTP replay
            // remains authoritative if delivery is missed.
            SyncV2PusherTransport::publishPublic(
                vttSyncV2ProjectBoardEventForUser($event, ['isGM' => false]),
                $socketId
            );
        } elseif (in_array($type, $combatTypes, true)) {
            if (vttSyncV2CombatEventIsPublicSafe($event)) {
                SyncV2PusherTransport::publishPublic(
                    vttSyncV2ProjectCombatEventForUser($event, ['isGM' => false]),
                    $socketId
                );
            }
        } elseif ($type === 'placement.batch') {
            // Until Phase 7 introduces audience-specific private channels,
            // only payloads that are byte-for-byte safe for every connected
            // user may use the shared board channel. Other accepted batches
            // arrive through authenticated HTTP replay (normally <=500 ms).
            if (vttSyncV2PlacementEventIsPublicSafe($event)) {
                $publicEvent = vttSyncV2ProjectPlacementEventForUser($event, ['isGM' => false]);
                SyncV2PusherTransport::publishPublic($publicEvent, $socketId);
            }
        } elseif ($type === 'token.move') {
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

    $responseEvent = $event;
    if (
        is_array($event)
        && in_array($type, $combatTypes, true)
        && is_array($auth ?? null)
    ) {
        $responseEvent = vttSyncV2ProjectCombatEventForUser($event, $auth);
    } elseif (is_array($event) && $isBoardDomainCommand && is_array($auth ?? null)) {
        $responseEvent = vttSyncV2ProjectBoardEventForUser($event, $auth);
    }

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => (
            $isBoardDomainCommand
            || in_array($type, ['token.move', 'placement.batch'], true)
            || in_array($type, $combatTypes, true)
        ) ? 'live' : 'shadow',
        'idempotent' => (bool) ($result['idempotent'] ?? false),
        'event' => $responseEvent,
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
