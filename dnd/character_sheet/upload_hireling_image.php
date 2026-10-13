<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not logged in'));
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');
$characters = array('cal', 'sharon', 'indigo', 'zepha');

$character = isset($_POST['character']) ? strtolower(trim($_POST['character'])) : '';
$hirelingId = isset($_POST['hireling_id']) ? trim($_POST['hireling_id']) : '';

if (!in_array($character, $characters)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid character'));
    exit;
}

if (!$is_gm && $character !== strtolower($user)) {
    echo json_encode(array('success' => false, 'error' => 'Permission denied'));
    exit;
}

if (empty($hirelingId)) {
    echo json_encode(array('success' => false, 'error' => 'Missing hireling ID'));
    exit;
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(array('success' => false, 'error' => 'No file uploaded or upload error'));
    exit;
}

$uploadedFile = $_FILES['image'];

// Judged by its content, named by the site, stored in a folder that runs nothing (includes/picture-store.php).
// The file used to keep the ending of the uploader's own file name, and was judged a picture on the browser's
// word alone.
require_once __DIR__ . '/../includes/picture-store.php';
$uploadsDir = __DIR__ . '/data/hireling_images';
$safeId = PictureStore::namePart(preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $hirelingId), 80);
if ($safeId === null) {
    echo json_encode(array('success' => false, 'error' => 'Invalid hireling.'));
    exit;
}
try {
    $fileName = PictureStore::store($uploadedFile, $uploadsDir, $character . '_' . $safeId . '_' . time());
} catch (InvalidArgumentException $refused) {
    echo json_encode(array('success' => false, 'error' => $refused->getMessage()));
    exit;
} catch (Throwable $failed) {
    $fileName = '';
}
$filePath = $uploadsDir . '/' . $fileName;

// Only now that the new picture is stored are this hireling's older ones removed, and only pictures: this
// hireling's exactly ("<character>_<id>_<time>.<ending>"), not every one whose id merely begins the same.
if ($fileName !== '') {
    foreach (glob($uploadsDir . '/' . $character . '_' . $safeId . '_*') ?: array() as $oldFile) {
        if ($oldFile !== $filePath && preg_match('/^' . preg_quote($character . '_' . $safeId, '/') . '_\d+\.(?:jpe?g|png|gif|webp|bmp)$/i', basename($oldFile)) === 1) {
            unlink($oldFile);
        }
    }
}

if ($fileName !== '') {
    $relativePath = 'data/hireling_images/' . $fileName;
    echo json_encode(array(
        'success' => true,
        'image_path' => $relativePath,
        'message' => 'Hireling image uploaded successfully'
    ));
} else {
    echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
}
