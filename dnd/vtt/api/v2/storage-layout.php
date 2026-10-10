<?php
declare(strict_types=1);

// Director only. Where the world is kept inside the database file, and the way to turn it back.
//
//   GET                       how the world is kept now, and whether a carry-over could not be made
//   POST {"layout":"single"}  put the world back into one row, in place, and keep it that way
//   POST {"layout":"split"}   carry it over to the split layout again, with a fresh dated copy first
//
// Turning back needs no deploy and loses nothing: the world reads back the same either way. Do it
// BEFORE going back to an older build of the site. An older build on a split world shows the world as
// it was on the day of the carry-over and refuses every change.

require_once __DIR__ . '/_common.php';

try {
    vttSyncV2RequireGm('Only the GM may see or change where the world is kept.');
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'GET') {
        vttSyncV2Respond(200, ['success' => true, 'storage' => vttSyncV2Store()->storageStatus()]);
    }
    if ($method !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'Method not allowed.']);
    }
    $input = vttSyncV2ReadJson();
    $layout = (string) ($input['layout'] ?? '');
    // The same lock every change to the board takes, so no command is half-way through while the layout changes.
    $storage = withVttBoardStateLock(static fn (): array => vttSyncV2Store()->changeStorageLayout($layout, true));
    vttSyncV2Respond(200, ['success' => true, 'storage' => $storage]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
