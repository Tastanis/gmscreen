<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
try {
    $auth = vttSyncV2RequireGm('Scene checkpoints are GM-only.');
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) vttSyncV2Respond(405, ['success'=>false, 'error'=>'Method not allowed.']);
    $store = vttSyncV2Store();
    $archive = $store->sceneCheckpoints();
    if ($method === 'DELETE') {
        $input = vttSyncV2ReadJson();
        vttSyncV2Respond(200, ['success'=>true, 'removed'=>$archive->remove((string) ($input['id'] ?? ''))]);
    }
    if ($method === 'POST') {
        $input = vttSyncV2ReadJson();
        $checkpoint = $archive->capture((string) ($input['id'] ?? ''), (string) ($input['name'] ?? ''),
            (string) ($input['sceneId'] ?? ''), $store->getSnapshot(), (string) $auth['user']);
        vttSyncV2Respond(200, ['success'=>true, 'checkpoint'=>$checkpoint]);
    }
    if (isset($_GET['id'])) {
        $checkpoint = $archive->get((string) $_GET['id']);
        if ($checkpoint === null) vttSyncV2Respond(404, ['success'=>false, 'error'=>'Checkpoint not found.']);
        vttSyncV2Respond(200, ['success'=>true, 'checkpoint'=>$checkpoint]);
    }
    $sceneId = trim((string) ($_GET['sceneId'] ?? ''));
    if ($sceneId === '') throw new InvalidArgumentException('A scene is required.');
    vttSyncV2Respond(200, ['success'=>true, 'checkpoints'=>$archive->list($sceneId)]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
