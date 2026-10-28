<?php
declare(strict_types=1);

// Vision on the 3D board, set by the Director for everyone (Brandon, October 27, 2026: players have no say over it;
// "that's for the DM to control for everyone"). board3d/sight-test.mjs reads it on every page and the Director's
// switch and look button write it.
//   GET                          → {success, vision: {on, look, updatedAt}}
//   POST {on: bool, look: name}  → the same, after the change (Director only)
// Looks: Grey, Dark, Black (what nobody sees).

require_once __DIR__ . '/_common.php';

const VTT_VISION_LOOKS = ['Grey', 'Dark', 'Black'];

function vttVisionRead(): array
{
    $stored = loadVttJson('vision.json');
    $look = is_array($stored) && in_array($stored['look'] ?? null, VTT_VISION_LOOKS, true) ? $stored['look'] : 'Grey';
    return [
        'on' => is_array($stored) && ($stored['on'] ?? false) === true,
        'look' => $look,
        'updatedAt' => is_array($stored) ? (int) ($stored['updatedAt'] ?? 0) : 0,
    ];
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'GET') {
        vttSyncV2RequireAuthenticated();
        header('Cache-Control: no-store');
        vttSyncV2Respond(200, ['success' => true, 'vision' => vttVisionRead()]);
    }
    if ($method !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'Method not allowed.']);
    }
    vttSyncV2RequireGm('Only the Director sets vision.');
    $body = vttSyncV2ReadJson();
    $current = vttVisionRead();
    $next = [
        'on' => array_key_exists('on', $body) ? $body['on'] === true : $current['on'],
        'look' => in_array($body['look'] ?? null, VTT_VISION_LOOKS, true) ? $body['look'] : $current['look'],
        'updatedAt' => (int) round(microtime(true) * 1000),
    ];
    if (!saveVttJson('vision.json', $next)) {
        vttSyncV2Respond(500, ['success' => false, 'error' => 'Vision could not be saved.']);
    }
    vttSyncV2Respond(200, ['success' => true, 'vision' => $next]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
