<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
try {
    vttSyncV2RequireGm('Player preview is GM-only.');
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        vttSyncV2Respond(405, ['success'=>false, 'error'=>'Method not allowed.']);
    }
    $userId = $_GET['user'] ?? '';
    if (!is_string($userId)) throw new InvalidArgumentException('Choose a configured player.');
    vttSyncV2Respond(200, ['success'=>true, 'preview'=>vttSyncV2BuildPlayerPreview(
        vttSyncV2Store()->getSnapshot(), $userId
    )]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
