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
    vttSyncV2RequireShadowGm();

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => 'shadow',
        'snapshot' => vttSyncV2Store()->getSnapshot(),
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
