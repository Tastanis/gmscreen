<?php
/**
 * "Upload monsters" for the Monster Creator: preview, then apply. The Director only, as the page
 * and save-monster-data.php are. The rules are in includes/monster-import.php; the write is the
 * one the creator's own Save uses (includes/monster-store.php: lock, backup, atomic rename), and
 * pictures are stored under upload-image.php's own names and checks.
 *
 *   POST JSON {"action":"preview","request":{...}}                       -> {success, preview}
 *   POST multipart action=apply, payload=<request JSON>, images[]=files   -> {success, results, counts}
 *   (apply may also come as JSON {"action":"apply","request":{...}} when no pictures are sent)
 */

session_start();
require_once __DIR__ . '/../../includes/players.php'; players_gate(); // a player turned off is logged out
header('Content-Type: application/json');
header('Cache-Control: no-store, max-age=0');

function monsterImportAnswer(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) monsterImportAnswer(401, ['success' => false, 'error' => 'Unauthorized']);
if (($_SESSION['user'] ?? '') !== 'GM') monsterImportAnswer(403, ['success' => false, 'error' => 'GM access required']);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') monsterImportAnswer(405, ['success' => false, 'error' => 'Use POST.']);

require_once __DIR__ . '/includes/monster-import.php';
require_once __DIR__ . '/includes/monster-store.php';
require_once __DIR__ . '/includes/monster-backup-helper.php';
require_once __DIR__ . '/../gm/includes/file-lock-manager.php';
if (!defined('MONSTER_IMAGE_INCLUDE_ONLY')) define('MONSTER_IMAGE_INCLUDE_ONLY', true);
require_once __DIR__ . '/upload-image.php'; // monsterImageName, monsterImageNameIsOurs, resizeImageIfNeeded

// The same paths save-monster-data.php uses, so both take the same lock.
$dataDir = __DIR__ . '/data/';
$dataFile = $dataDir . 'gm-monsters.json';
$imagesDir = __DIR__ . '/images/';
$env = ['imagesDir' => $imagesDir];
const MONSTER_IMPORT_MAX_BYTES = 16 * 1024 * 1024;

$action = (string) ($_POST['action'] ?? '');
$request = null;
if ($action !== '') {
    $payload = (string) ($_POST['payload'] ?? '');
    if (strlen($payload) > MONSTER_IMPORT_MAX_BYTES) monsterImportAnswer(413, ['success' => false, 'error' => 'The upload is too large.']);
    $request = json_decode($payload, true);
} else {
    $raw = file_get_contents('php://input', false, null, 0, MONSTER_IMPORT_MAX_BYTES + 1);
    if ($raw === false || $raw === '') monsterImportAnswer(400, ['success' => false, 'error' => 'The request was empty. It may be over this server\'s size limit (post_max_size).']);
    if (strlen($raw) > MONSTER_IMPORT_MAX_BYTES) monsterImportAnswer(413, ['success' => false, 'error' => 'The upload is too large.']);
    $body = json_decode($raw, true);
    $action = is_array($body) ? (string) ($body['action'] ?? '') : '';
    $request = is_array($body) ? ($body['request'] ?? null) : null;
}
if (!in_array($action, ['preview', 'apply'], true)) monsterImportAnswer(400, ['success' => false, 'error' => 'Unknown action.']);
if (!is_array($request)) monsterImportAnswer(422, ['success' => false, 'error' => 'The request is not valid JSON.']);

try {
    if ($action === 'preview') {
        $preview = monsterImportPlan(monsterStoreRead($dataFile), $request, $env);
        // The largest picture this server takes, so the page can say so before Import.
        $iniBytes = static function (string $value): int {
            $number = (int) $value; $unit = strtolower(substr(trim($value), -1));
            return $unit === 'g' ? $number * 1073741824 : ($unit === 'm' ? $number * 1048576 : ($unit === 'k' ? $number * 1024 : $number));
        };
        $limit = min(5 * 1024 * 1024, $iniBytes((string) ini_get('upload_max_filesize')) ?: PHP_INT_MAX, $iniBytes((string) ini_get('post_max_size')) ?: PHP_INT_MAX);
        $preview['limits'] = ['pictureBytes' => $limit, 'pictureLimit' => (string) ini_get('upload_max_filesize')];
        monsterImportAnswer(200, ['success' => true, 'preview' => $preview]);
    }

    // The picture files sent with the upload, by the name they were sent under.
    $uploads = [];
    if (isset($_FILES['images']) && is_array($_FILES['images']['name'] ?? null)) {
        foreach ($_FILES['images']['name'] as $i => $name) {
            $uploads[basename((string) $name)] = ['tmp' => (string) ($_FILES['images']['tmp_name'][$i] ?? ''), 'error' => (int) ($_FILES['images']['error'][$i] ?? UPLOAD_ERR_NO_FILE), 'size' => (int) ($_FILES['images']['size'][$i] ?? 0)];
        }
    }
    $request['images'] = array_map(static fn($name) => ['name' => $name], array_keys($uploads));
    $stored = [];
    $storeImage = static function (string $uploadName, string $monsterId) use ($uploads, $imagesDir, &$stored): string {
        $file = $uploads[$uploadName] ?? null;
        if ($file && in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new RuntimeException('it is over this server\'s upload limit (upload_max_filesize ' . ini_get('upload_max_filesize') . ').');
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp'])) throw new RuntimeException('the file did not arrive.');
        if ($file['size'] > 5 * 1024 * 1024) throw new RuntimeException('it is over 5 MB.');
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = (string) finfo_file($finfo, $file['tmp']);
        finfo_close($finfo);
        $name = monsterImageName($monsterId, $mime, time());
        if ($name === null) throw new RuntimeException('it is not a JPEG, PNG, GIF or WebP picture.');
        if (!is_dir($imagesDir)) mkdir($imagesDir, 0755, true);
        // Copied, not moved: one picture file may serve more than one monster of the upload.
        if (!copy($file['tmp'], $imagesDir . $name)) throw new RuntimeException('it could not be saved.');
        $stored[] = $imagesDir . $name;
        try { resizeImageIfNeeded($imagesDir . $name, 300, 300); } catch (Throwable $error) { /* kept at its own size */ }
        return $name;
    };

    if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
    $lock = new FileLockManager($dataDir);
    $outcome = $lock->withLock($dataFile, static function () use ($request, $env, $dataFile, $dataDir, $storeImage, &$stored): array {
        $done = monsterImportApply(monsterStoreRead($dataFile), $request, $env, (int) round(microtime(true) * 1000), $storeImage);
        if ($done['changed']) {
            try {
                // A backup that outlives the next few ordinary saves, then the ordinary save's own.
                if (file_exists($dataFile)) (new MonsterBackupHelper($dataDir))->createBackup($dataFile, 'session');
                monsterStoreWriteLocked($done['data'], $dataFile, $dataDir, 'pre-save', (string) ($_SESSION['user'] ?? 'GM'));
            } catch (Throwable $error) {
                foreach ($stored as $path) @unlink($path); // nothing saved: no stray pictures either
                throw $error;
            }
        }
        return $done['results'];
    });
    if (!($outcome['success'] ?? false)) {
        error_log('Monster Creator: upload apply failed - ' . ($outcome['error'] ?? 'unknown'));
        monsterImportAnswer(500, ['success' => false, 'error' => 'The monsters could not be saved. Nothing was changed.']);
    }
    $results = $outcome['result'];
    $counts = ['created' => 0, 'updated' => 0, 'skipped' => 0];
    foreach ($results as $result) $counts[$result['action']] = ($counts[$result['action']] ?? 0) + 1;
    monsterImportAnswer(200, ['success' => true, 'results' => $results, 'counts' => $counts]);
} catch (InvalidArgumentException $error) {
    monsterImportAnswer(422, ['success' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('Monster Creator: upload failed - ' . get_class($error) . ': ' . $error->getMessage());
    monsterImportAnswer(500, ['success' => false, 'error' => 'The upload failed on the server. Nothing was changed.']);
}
