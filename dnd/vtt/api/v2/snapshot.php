<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        vttSyncV2Respond(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }
    $auth = vttSyncV2DomainEnabled('token_movement')
        ? vttSyncV2RequireAuthenticated()
        : vttSyncV2RequireShadowGm();
    vttSyncV2Store()->touchPresence(
        (string) ($auth['user'] ?? ''),
        (bool) ($auth['isGM'] ?? false)
    );

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => vttSyncV2DomainEnabled('token_movement') ? 'live' : 'shadow',
        'snapshot' => vttSyncV2ProjectSnapshotForUser(vttSyncV2Store()->getSnapshot(), $auth),
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
