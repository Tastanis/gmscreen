<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

$user = $_SESSION['user'];

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
    
    // Validate file type
    $allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp'
    ];
    
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    
    $fileType = $file['type'];
    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    if (!in_array($fileType, $allowedTypes) && !in_array($fileExtension, $allowedExtensions)) {
        throw new Exception('Invalid file type. Allowed types: ' . implode(', ', $allowedExtensions));
    }
    
    // Validate file size (limit to 10MB)
    $maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if ($file['size'] > $maxSize) {
        throw new Exception('File too large. Maximum size is 10MB.');
    }
    
    // Create uploads directory if it doesn't exist
    $uploadsDir = 'uploads/images';
    if (!is_dir($uploadsDir)) {
        if (!mkdir($uploadsDir, 0755, true)) {
            throw new Exception('Failed to create uploads directory');
        }
    }
    
    // Generate unique filename
    $originalName = pathinfo($file['name'], PATHINFO_FILENAME);
    $extension = $fileExtension;
    $timestamp = time();
    $randomString = bin2hex(random_bytes(8));
    $newFilename = $originalName . '_' . $timestamp . '_' . $randomString . '.' . $extension;
    
    // Full path for the uploaded file
    $filePath = $uploadsDir . '/' . $newFilename;
    
    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        throw new Exception('Failed to save uploaded file');
    }
    
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