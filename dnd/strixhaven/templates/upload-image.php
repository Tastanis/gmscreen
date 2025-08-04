<?php
session_start();

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

// Validate file type
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$fileType = $_FILES['image']['type'];
if (!in_array($fileType, $allowedTypes)) {
    echo json_encode(['success' => false, 'error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed']);
    exit;
}

// Validate file size (max 5MB)
$maxSize = 5 * 1024 * 1024; // 5MB
if ($_FILES['image']['size'] > $maxSize) {
    echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 5MB']);
    exit;
}

// Create images directory if it doesn't exist
$uploadDir = 'images/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate unique filename
$fileExtension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
$fileName = $templateId . '_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $fileExtension;
$targetPath = $uploadDir . $fileName;

// Move uploaded file
if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
    // Return success with image path
    echo json_encode([
        'success' => true,
        'image_path' => $targetPath,
        'filename' => $fileName
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
}