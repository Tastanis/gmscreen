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

    $auth = vttSyncV2RequireShadowGm();
    $command = vttSyncV2ReadJson();
    $result = vttSyncV2Store()->acceptShadowCommand(
        $command,
        (string) ($auth['user'] ?? 'GM')
    );

    if ($result['status'] === 'conflict') {
        vttSyncV2Respond(409, [
            'success' => false,
            'error' => $result['error'] ?? 'revision_conflict',
            'snapshot' => $result['snapshot'] ?? null,
        ]);
    }

    $event = $result['event'] ?? null;
    if (is_array($event) && empty($result['idempotent'])) {
        $socketId = isset($command['socketId']) && is_string($command['socketId'])
            ? trim($command['socketId'])
            : null;
        SyncV2PusherTransport::publish($event, $socketId === '' ? null : $socketId);
    }

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => 'shadow',
        'idempotent' => (bool) ($result['idempotent'] ?? false),
        'event' => $event,
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
