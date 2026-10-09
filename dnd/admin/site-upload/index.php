<?php
declare(strict_types=1);

// The key-guarded site upload. See docs/site-upload.md and lib.php.
//
// Uploading this file grants nothing. It answers only when a private configuration file exists
// OUTSIDE public_html, and then only to a caller who sends the key that file holds the hash of.
// With no configuration file it answers 404, the same as a page that is not there. Deleting the
// configuration file switches the whole thing off.

require_once __DIR__ . '/lib.php';
ini_set('display_errors', '0');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json');

function siteUploadAnswer(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// This file is OUTSIDE public_html: /home/<account>/dnd-site-upload.php
$private = dirname(__DIR__, 4) . '/dnd-site-upload.php';
$config = siteUploadConfig($private);
if ($config === null) siteUploadAnswer(404, ['success'=>false, 'error'=>'Not found.']);

[$status, $message] = siteUploadAuthorize($_SERVER, $config, siteUploadStateDir($config, $private), time());
if ($status !== 200) siteUploadAnswer($status, ['success'=>false, 'error'=>$message]);

try {
    $action = (string) ($_GET['action'] ?? '');
    if (!in_array($action, ['status', 'map-image', 'map-import', 'creature-import'], true)) siteUploadAnswer(400, ['success'=>false, 'error'=>'Unknown action.']);

    define('VTT_SCENES_API_INCLUDE_ONLY', true);
    require_once __DIR__ . '/../../vtt/api/scenes.php'; // bootstrap, the store, the scene list, the lock
    require_once __DIR__ . '/../../vtt/lib/MapImageStore.php';
    require_once __DIR__ . '/../../strixhaven/monster-creator/includes/monster-store.php';
    require_once __DIR__ . '/../../strixhaven/gm/includes/file-lock-manager.php';
    $monsterDir = __DIR__ . '/../../strixhaven/monster-creator/data/';
    $monsterFile = $monsterDir . 'gm-monsters.json';

    // What the tool needs to know before it sends anything: the folder and tab names, and how
    // large a request this server accepts. Nothing else about the site is given out.
    if ($action === 'status') {
        $catalog = withVttBoardStateLock(static fn(): array => SceneImportCatalog::recover(vttSyncV2Store(), loadScenesPayload(), 'persistScenes'));
        $tabs = [];
        try { $tabs = siteUploadTabNames(monsterStoreRead($monsterFile)); } catch (Throwable $error) { $tabs = []; }
        siteUploadAnswer(200, ['success'=>true, 'result'=>[
            'folders'=>siteUploadFolderNames($catalog),
            'monsterTabs'=>$tabs,
            'limits'=>['upload_max_filesize'=>(string) ini_get('upload_max_filesize'), 'post_max_size'=>(string) ini_get('post_max_size'), 'memory_limit'=>(string) ini_get('memory_limit'), 'max_execution_time'=>(string) ini_get('max_execution_time')],
        ]]);
    }

    // One picture of a map package: checked and filed by the Scenes screen's own code. The same
    // picture sent again keeps its address, so a map replaced by a newer version of itself keeps
    // what each player's browser remembers of it.
    if ($action === 'map-image') {
        if (!isset($_FILES['map'])) siteUploadAnswer(400, ['success'=>false, 'error'=>'No map image was provided. If the picture is large, it may be over this server\'s upload limit.']);
        [$code, $payload] = MapImageStore::store($_FILES['map'], true);
        siteUploadAnswer($code, $payload);
    }

    $limit = $action === 'map-import' ? SITE_UPLOAD_MAX_JSON_BYTES : SITE_UPLOAD_MAX_CREATURE_BYTES;
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || $raw === '') siteUploadAnswer(400, ['success'=>false, 'error'=>'The request was empty. It may be over this server\'s size limit (post_max_size).']);
    if (strlen($raw) > $limit) siteUploadAnswer(413, ['success'=>false, 'error'=>'The request is too large (' . intdiv($limit, 1048576) . ' MB maximum).']);
    try { $request = json_decode($raw, true, 128, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { siteUploadAnswer(422, ['success'=>false, 'error'=>'The request is not valid JSON.']); }
    if (!is_array($request)) siteUploadAnswer(422, ['success'=>false, 'error'=>'The request must be a JSON object.']);

    if ($action === 'map-import') {
        $done = withVttBoardStateLock(static fn(): array => siteUploadImportMap($request, vttSyncV2Store(), 'loadScenesPayload', 'persistScenes'));
        // Open browsers hear of it the way they hear of an import from the Scenes screen.
        foreach ($done['events'] as $event) {
            try { SyncV2PusherTransport::publishAudiences($event, vttSyncV2ProjectEventForUser($event, ['isGM'=>false])); }
            catch (Throwable $error) { error_log('[VTT] Site upload could not announce an event.'); }
        }
        siteUploadAnswer(200, ['success'=>true, 'result'=>$done['result']]);
    }

    // Creatures: already put through the monster creator's own import and checker by the tool.
    $entries = $request['creatures'] ?? null;
    if (!is_array($entries) || !array_is_list($entries) || $entries === [] || count($entries) > 200) siteUploadAnswer(422, ['success'=>false, 'error'=>'Send between 1 and 200 creatures.']);
    if (!is_dir($monsterDir)) mkdir($monsterDir, 0755, true);
    $lock = new FileLockManager($monsterDir);
    $options = ['replace'=>($request['replace'] ?? false) === true, 'tab'=>$request['tab'] ?? '', 'subTab'=>$request['subTab'] ?? '', 'createTab'=>($request['createTab'] ?? false) === true];
    $outcome = $lock->withLock($monsterFile, static function () use ($entries, $options, $monsterFile, $monsterDir): array {
        $merged = siteUploadMergeCreatures(monsterStoreRead($monsterFile), $entries, $options, (int) round(microtime(true) * 1000));
        if ($merged['changed']) monsterStoreWriteLocked($merged['data'], $monsterFile, $monsterDir, 'pre-save', 'site-upload');
        return $merged['results'];
    });
    if (!($outcome['success'] ?? false)) siteUploadAnswer(500, ['success'=>false, 'error'=>'The creatures could not be saved. Nothing was changed.']);
    siteUploadAnswer(200, ['success'=>true, 'result'=>['creatures'=>$outcome['result']]]);
} catch (InvalidArgumentException $error) {
    // These are written for the person reading the tool's output; they name no paths.
    siteUploadAnswer(422, ['success'=>false, 'error'=>$error->getMessage()]);
} catch (Throwable $error) {
    // Never leak paths, credentials, or PHP/SQL details through an error response.
    error_log('[VTT] Site upload failed: ' . get_class($error));
    siteUploadAnswer(500, ['success'=>false, 'error'=>'The upload failed on the server. Nothing was changed.']);
}
