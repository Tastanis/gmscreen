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
    vttSyncV2RequireGm();
    vttSyncV2Respond(200, [
        'success' => true,
        'status' => vttSyncV2Store()->getOperationalStatus(),
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
