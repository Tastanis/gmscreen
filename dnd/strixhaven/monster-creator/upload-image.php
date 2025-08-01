<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// Set JSON response header for non-upload actions
$action = $_POST['action'] ?? $_SERVER['REQUEST_METHOD'];
if ($action === 'delete') {
    header('Content-Type: application/json');
}

// Handle different actions
if ($action === 'upload') {
    handleImageUpload();
} elseif ($action === 'delete') {
    handleImageDelete();
} else {
    echo json_encode(['success' => false, 'error' => 'Invalid action']);
}

/**
 * Handle image upload
 */
function handleImageUpload() {
    header('Content-Type: application/json');
    
    // Check if file was uploaded
    if (!isset($_FILES['image'])) {
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        return;
    }
    
    $file = $_FILES['image'];
    $monsterId = $_POST['monsterId'] ?? '';
    
    // Validate file upload
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'Upload failed']);
        return;
    }
    
    // Validate file size (5MB max)
    if ($file['size'] > 5 * 1024 * 1024) {
        echo json_encode(['success' => false, 'error' => 'File too large (max 5MB)']);
        return;
    }
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, $allowedTypes)) {
        echo json_encode(['success' => false, 'error' => 'Invalid file type']);
        return;
    }
    
    // Create images directory if it doesn't exist
    $uploadDir = __DIR__ . '/images/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'monster_' . $monsterId . '_' . time() . '.' . $extension;
    $targetPath = $uploadDir . $filename;
    
    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        // Optionally resize image if needed
        resizeImageIfNeeded($targetPath, 300, 300);
        
        echo json_encode([
            'success' => true,
            'filename' => $filename,
            'message' => 'Image uploaded successfully'
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
    }
}

/**
 * Handle image deletion
 */
function handleImageDelete() {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    $filename = $input['filename'] ?? '';
    
    if (!$filename) {
        echo json_encode(['success' => false, 'error' => 'No filename provided']);
        return;
    }
    
    // Validate filename format (prevent directory traversal)
    if (!preg_match('/^monster_[a-zA-Z0-9_]+\.(jpg|jpeg|png|gif|webp)$/', $filename)) {
        echo json_encode(['success' => false, 'error' => 'Invalid filename']);
        return;
    }
    
    $filepath = __DIR__ . '/images/' . $filename;
    
    if (file_exists($filepath)) {
        if (unlink($filepath)) {
            echo json_encode(['success' => true, 'message' => 'Image deleted']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to delete file']);
        }
    } else {
        echo json_encode(['success' => true, 'message' => 'File not found (already deleted)']);
    }
}

/**
 * Resize image if it's too large
 */
function resizeImageIfNeeded($filepath, $maxWidth, $maxHeight) {
    list($width, $height, $type) = getimagesize($filepath);
    
    // Only resize if image is larger than max dimensions
    if ($width <= $maxWidth && $height <= $maxHeight) {
        return;
    }
    
    // Calculate new dimensions maintaining aspect ratio
    $ratio = min($maxWidth / $width, $maxHeight / $height);
    $newWidth = round($width * $ratio);
    $newHeight = round($height * $ratio);
    
    // Create new image
    $newImage = imagecreatetruecolor($newWidth, $newHeight);
    
    // Load original image based on type
    switch ($type) {
        case IMAGETYPE_JPEG:
            $source = imagecreatefromjpeg($filepath);
            break;
        case IMAGETYPE_PNG:
            $source = imagecreatefrompng($filepath);
            // Preserve transparency
            imagealphablending($newImage, false);
            imagesavealpha($newImage, true);
            break;
        case IMAGETYPE_GIF:
            $source = imagecreatefromgif($filepath);
            break;
        case IMAGETYPE_WEBP:
            $source = imagecreatefromwebp($filepath);
            break;
        default:
            return; // Unsupported type
    }
    
    // Resize
    imagecopyresampled($newImage, $source, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
    
    // Save resized image
    switch ($type) {
        case IMAGETYPE_JPEG:
            imagejpeg($newImage, $filepath, 90);
            break;
        case IMAGETYPE_PNG:
            imagepng($newImage, $filepath, 9);
            break;
        case IMAGETYPE_GIF:
            imagegif($newImage, $filepath);
            break;
        case IMAGETYPE_WEBP:
            imagewebp($newImage, $filepath, 90);
            break;
    }
    
    // Clean up
    imagedestroy($source);
    imagedestroy($newImage);
}
?>