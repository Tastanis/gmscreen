<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/ScenePackage.php';
try {
    vttSyncV2RequireGm('Only the GM may export scenes.');
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') vttSyncV2Respond(405, ['success'=>false,'error'=>'Method not allowed.']);
    $sceneId = trim((string) ($_GET['sceneId'] ?? ''));
    if ($sceneId === '') throw new InvalidArgumentException('Choose a scene to export.');
    $catalog = loadVttScenes(); $scene = null; $folder = null;
    foreach ($catalog['items'] as $candidate) if (($candidate['id'] ?? null) === $sceneId) { $scene = $candidate; break; }
    if ($scene === null) vttSyncV2Respond(404, ['success'=>false,'error'=>'Scene not found.']);
    foreach ($catalog['folders'] as $candidate) if (($candidate['id'] ?? null) === ($scene['folderId'] ?? null)) { $folder = $candidate; break; }
    vttSyncV2Respond(200, ['success'=>true,'package'=>ScenePackage::build($scene, vttSyncV2Store()->getSnapshot(), $folder)]);
} catch (Throwable $error) { vttSyncV2HandleFailure($error); }
