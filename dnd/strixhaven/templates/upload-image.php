<?php
session_start();
require_once __DIR__ . '/../../includes/players.php'; players_gate(); // a player turned off is logged out

// Check if user is logged in as GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// Check if file was uploaded
if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'error' => 'No file uploaded or upload error']);
    exit;
}

$templateId = $_POST['template_id'] ?? '';
if (!$templateId) {
    echo json_encode(['success' => false, 'error' => 'No template ID provided']);
    exit;
}

// Judged by its content, named by the site, stored in a folder that runs nothing (includes/picture-store.php).
// The file used to keep the ending of the uploader's own file name, the browser's word that it was a picture
// was enough, and the template's id went into the path as it came.
require_once __DIR__ . '/../../includes/picture-store.php';
$uploadDir = 'images/';
$fileName = '';
try {
    $fileName = PictureStore::store($_FILES['image'], __DIR__ . '/images', (PictureStore::plainPart($templateId) ?? 'template') . '_' . time() . '_' . bin2hex(random_bytes(8)));
} catch (InvalidArgumentException $refused) {
    echo json_encode(['success' => false, 'error' => $refused->getMessage()]);
    exit;
} catch (Throwable $failed) {
    $fileName = '';
}
$targetPath = $uploadDir . $fileName;

if ($fileName !== '') {
    // Return success with image path
    echo json_encode([
        'success' => true,
        'image_path' => $targetPath,
        'filename' => $fileName
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
}