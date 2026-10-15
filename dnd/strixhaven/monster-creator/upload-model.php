<?php
/**
 * A monster's 3D mini (.glb), added in the Monster Creator, which is the Director's page.
 * See docs/vtt-3d-minis.md.
 *
 * The Director only (as the page, save-monster-data.php and upload-image.php are). The file is
 * checked and stored by includes/model-store.php under a name made from its own content; nothing of
 * the uploader's file name is kept, and models/.htaccess runs nothing in that folder. There is no
 * delete: the same file may be the model of several monsters, and a stored model is small.
 */

require_once __DIR__ . '/includes/model-store.php';

session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}
if (($_SESSION['user'] ?? '') !== 'GM') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'GM access required']);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || ($_POST['action'] ?? '') !== 'upload') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid action']);
    exit;
}

$file = $_FILES['model'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
    $tooLarge = is_array($file) && in_array($file['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
    http_response_code($tooLarge ? 413 : 400);
    echo json_encode(['success' => false, 'error' => $tooLarge ? 'The model is over this server\'s upload limit.' : 'No model file was uploaded.']);
    exit;
}
if ((int) $file['size'] > MONSTER_MODEL_MAX_BYTES) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'A mini may be at most ' . (MONSTER_MODEL_MAX_BYTES / 1048576) . ' MB.']);
    exit;
}

try {
    $bytes = file_get_contents($file['tmp_name']);
    if ($bytes === false) throw new RuntimeException('The upload could not be read.');
    $result = monsterModelStore($bytes, __DIR__ . '/models');
    echo json_encode(['success' => true, 'filename' => $result['file'], 'stats' => $result['stats'], 'stored' => $result['stored']]);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('Monster Creator: model upload failed: ' . get_class($error));
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'The model could not be saved.']);
}
