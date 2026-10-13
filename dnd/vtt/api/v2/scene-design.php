<?php
declare(strict_types=1);

// One scene's design (ground heights, walls, zones, what has been explored), as this viewer may see it: the part
// of a snapshot that a page asking with ?designs= is not sent for the scenes it is not showing. A page fetches it
// when it comes to show that scene. See vttSyncV2ScopeDesigns in _common.php.

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
    $sceneId = $_GET['sceneId'] ?? null;
    if (!is_string($sceneId) || preg_match('/^[A-Za-z0-9_-]{1,120}$/D', $sceneId) !== 1) {
        vttSyncV2Respond(422, [
            'success' => false,
            'error' => 'sceneId is required.',
        ]);
    }

    vttSyncV2Respond(200, ['success' => true] + vttSyncV2SceneDesign(
        vttSyncV2ProjectSnapshotForUser(vttSyncV2Store()->getSnapshot(), $auth),
        $sceneId
    ));
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
