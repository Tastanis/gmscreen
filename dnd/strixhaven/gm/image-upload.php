<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

if (!$is_gm) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Access denied']);
    exit;
}

require_once __DIR__ . '/../../includes/picture-store.php';

// Set content type
header('Content-Type: application/json');

// Check if this is an image upload request
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['image'])) {
    echo json_encode(['success' => false, 'error' => 'No image file provided']);
    exit;
}

try {
    $file = $_FILES['image'];
    
    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Upload failed with error code: ' . $file['error']);
    }
    
    // Judged by its content, named by the site, stored in a folder that runs nothing (includes/picture-store.php).
    // Nothing of the uploader's file name is kept, and what the browser says the file is counts for nothing.
    $uploadsDir = 'uploads/images';
    $newFilename = PictureStore::store($file, __DIR__ . '/' . $uploadsDir, 'img_' . time() . '_' . bin2hex(random_bytes(8)), 10 * 1024 * 1024);
    $filePath = $uploadsDir . '/' . $newFilename;
    $fileType = array_search(pathinfo($newFilename, PATHINFO_EXTENSION), PictureStore::KINDS, true) ?: '';

    // Get file info
    $fileSize = filesize($filePath);
    $imageInfo = getimagesize($filePath);
    $width = $imageInfo ? $imageInfo[0] : 0;
    $height = $imageInfo ? $imageInfo[1] : 0;
    
    // Return success response with file info
    echo json_encode([
        'success' => true,
        'filename' => $newFilename,
        'originalName' => $file['name'],
        'filePath' => $filePath,
        'url' => $filePath, // Relative URL for web access
        'size' => $fileSize,
        'width' => $width,
        'height' => $height,
        'type' => $fileType
    ]);
    
} catch (Exception $e) {
    error_log('Image upload error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>