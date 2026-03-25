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
$characters = array('frunk', 'sharon', 'indigo', 'zepha');

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

$allowedTypes = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp');
if (!in_array($uploadedFile['type'], $allowedTypes)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid file type. Only JPG, PNG, GIF, BMP, and WebP images are allowed.'));
    exit;
}

$maxSize = 5 * 1024 * 1024;
if ($uploadedFile['size'] > $maxSize) {
    echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
    exit;
}

$uploadsDir = __DIR__ . '/data/hireling_images';
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}

$fileExtension = strtolower(pathinfo($uploadedFile['name'], PATHINFO_EXTENSION));
$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $hirelingId);
$fileName = $character . '_' . $safeId . '_' . time() . '.' . $fileExtension;
$filePath = $uploadsDir . '/' . $fileName;

// Remove old image for this hireling if it exists
$existingFiles = glob($uploadsDir . '/' . $character . '_' . $safeId . '_*');
foreach ($existingFiles as $oldFile) {
    if ($oldFile !== $filePath) {
        unlink($oldFile);
    }
}

if (move_uploaded_file($uploadedFile['tmp_name'], $filePath)) {
    $relativePath = 'data/hireling_images/' . $fileName;
    echo json_encode(array(
        'success' => true,
        'image_path' => $relativePath,
        'message' => 'Hireling image uploaded successfully'
    ));
} else {
    echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
}
