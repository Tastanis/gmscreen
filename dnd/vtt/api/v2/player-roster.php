<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/PlayerRoster.php';
try {
    vttSyncV2RequireGm('Only the GM may manage the VTT roster.');
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'GET') vttSyncV2Respond(200, ['success'=>true, ...PlayerRoster::read()]);
    if ($method !== 'POST') vttSyncV2Respond(405, ['success'=>false, 'error'=>'Method not allowed.']);
    $input = vttSyncV2ReadJson();
    vttSyncV2Respond(200, ['success'=>true, ...PlayerRoster::replace($input['players'] ?? null, (string) ($input['revision'] ?? ''))]);
} catch (PlayerRosterConflict $error) {
    vttSyncV2Respond(409, ['success'=>false, 'error'=>$error->getMessage()]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
