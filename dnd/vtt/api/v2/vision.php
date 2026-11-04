<?php
declare(strict_types=1);

// Vision on the 3D board, set by the Director for everyone (Brandon, October 27, 2026: players have no say over it;
// "that's for the DM to control for everyone"). board3d/sight-test.mjs reads it on every page and the Director's
// switch and look button write it.
//   GET                          → {success, vision: {on, look, updatedAt}}
//   POST {on: bool, look: name}  → the same, after the change (Director only)
//   GET  ?explored=<scene>       → {success, cells: ["c,r", ...], forgotten: n}  squares the party has seen (look
//                                   "Explored"); forgotten counts the Director's wipes, so a page knows to wipe too
//   POST {explore: <scene>, cells: ["c,r", ...]}  a player's page adds the squares its heroes saw (anyone signed in)
//   POST {forget: <scene>}       → the scene's memory wiped (Director only)
// Looks: Grey, Dark, Black (what nobody sees), Explored (black, but greyed where the heroes have been).

require_once __DIR__ . '/_common.php';

const VTT_VISION_LOOKS = ['Grey', 'Dark', 'Black', 'Explored'];
const VTT_VISION_MAX_CELLS = 60000;

function vttVisionScene($value): string
{
    $scene = is_string($value) ? trim($value) : '';
    return preg_match('/^[A-Za-z0-9_-]{1,120}$/', $scene) === 1 ? $scene : '';
}

function vttVisionExplored(): array
{
    $stored = loadVttJson('vision-explored.json');
    return is_array($stored) ? $stored : [];
}

/** One scene's memory: ['cells' => ["c,r" => 1], 'forgotten' => n]. */
function vttVisionSceneMemory(array $all, string $scene): array
{
    $entry = is_array($all[$scene] ?? null) ? $all[$scene] : [];
    if (!array_key_exists('cells', $entry)) $entry = ['cells' => $entry, 'forgotten' => 0];
    return ['cells' => is_array($entry['cells']) ? $entry['cells'] : [], 'forgotten' => (int) ($entry['forgotten'] ?? 0)];
}

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
        if (isset($_GET['explored'])) {
            $scene = vttVisionScene($_GET['explored']);
            $memory = $scene === '' ? ['cells' => [], 'forgotten' => 0] : vttVisionSceneMemory(vttVisionExplored(), $scene);
            vttSyncV2Respond(200, ['success' => true, 'cells' => array_keys($memory['cells']), 'forgotten' => $memory['forgotten']]);
        }
        vttSyncV2Respond(200, ['success' => true, 'vision' => vttVisionRead()]);
    }
    if ($method !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'Method not allowed.']);
    }
    $body = vttSyncV2ReadJson();
    if (isset($body['explore'])) {
        vttSyncV2RequireAuthenticated();
        $scene = vttVisionScene($body['explore']);
        if ($scene === '' || !is_array($body['cells'] ?? null)) {
            vttSyncV2Respond(422, ['success' => false, 'error' => 'A scene and squares are needed.']);
        }
        $all = vttVisionExplored();
        $memory = vttVisionSceneMemory($all, $scene);
        // Squares seen before the Director's last wipe (a page that has not heard of it yet) are not taken.
        if (isset($body['forgotten']) && (int) $body['forgotten'] !== $memory['forgotten']) {
            vttSyncV2Respond(200, ['success' => true, 'count' => count($memory['cells']), 'forgotten' => $memory['forgotten']]);
        }
        $seen = $memory['cells'];
        foreach (array_slice($body['cells'], 0, 5000) as $cell) {
            if (is_string($cell) && preg_match('/^-?\d{1,4},-?\d{1,4}$/', $cell) === 1 && count($seen) < VTT_VISION_MAX_CELLS) $seen[$cell] = 1;
        }
        $all[$scene] = ['cells' => $seen, 'forgotten' => $memory['forgotten']];
        if (!saveVttJson('vision-explored.json', $all)) {
            vttSyncV2Respond(500, ['success' => false, 'error' => 'The explored squares could not be saved.']);
        }
        vttSyncV2Respond(200, ['success' => true, 'count' => count($seen), 'forgotten' => $memory['forgotten']]);
    }
    vttSyncV2RequireGm('Only the Director sets vision.');
    if (isset($body['forget'])) {
        $scene = vttVisionScene($body['forget']);
        $all = vttVisionExplored();
        $all[$scene] = ['cells' => [], 'forgotten' => vttVisionSceneMemory($all, $scene)['forgotten'] + 1];
        saveVttJson('vision-explored.json', $all);
        vttSyncV2Respond(200, ['success' => true]);
    }
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
