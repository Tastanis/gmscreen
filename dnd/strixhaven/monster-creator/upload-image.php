<?php
/**
 * The picture a monster is given in the Monster Creator, which is the Director's page.
 *
 * This handler used to ask only that somebody was logged in, so a player's login could upload and delete here.
 * And it saved a file under the ENDING of the name the uploader gave it, having checked only that the content
 * began like a picture: a file called x.php with a picture's first bytes was saved as monster_..._.php in a
 * folder the web server would run it from. The monster's id went into the file's path as it came, too.
 *
 * Now: the Director only (as the page and save-monster-data.php are); the stored name is built here, its
 * ending taken from the kind of picture the content was found to be and never from the uploader; the id is
 * letters, digits, "_" and "-" only; and images/.htaccess runs nothing in that folder.
 */

/** The file ending for a checked picture type, or null for anything that is not one of the four kinds taken. */
function monsterImageExtension(string $mimeType): ?string
{
    return ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'][$mimeType] ?? null;
}

/** The name a monster's picture is stored under, or null when the id or the picture's kind is not acceptable. */
function monsterImageName($monsterId, string $mimeType, int $time): ?string
{
    $extension = monsterImageExtension($mimeType);
    if ($extension === null || !is_string($monsterId) || preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $monsterId) !== 1) return null;
    return 'monster_' . $monsterId . '_' . $time . '.' . $extension;
}

/** Whether a name is one this handler could have stored: nothing else is ever deleted. */
function monsterImageNameIsOurs($filename): bool
{
    return is_string($filename) && preg_match('/^monster_[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/D', $filename) === 1;
}

if (defined('MONSTER_IMAGE_INCLUDE_ONLY') && MONSTER_IMAGE_INCLUDE_ONLY) {
    return;
}

session_start();
require_once __DIR__ . '/../../includes/players.php'; players_gate(); // a player turned off is logged out

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// The Monster Creator is the Director's.
if (($_SESSION['user'] ?? '') !== 'GM') {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'GM access required']);
    exit;
}

// Determine action and set appropriate headers
$action = $_POST['action'] ?? null;

// For delete action, get JSON input
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['action'])) {
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input && isset($input['action'])) {
        $action = $input['action'];
    }
}

// Set JSON response header
header('Content-Type: application/json');

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
    // Header already set above
    
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
    // The name is ours from end to end: nothing of the uploader's file name is kept.
    $filename = monsterImageName($monsterId, (string) $mimeType, time());
    if ($filename === null) {
        echo json_encode(['success' => false, 'error' => 'Invalid monster']);
        return;
    }
    
    // Create images directory if it doesn't exist
    $uploadDir = __DIR__ . '/images/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
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
    
    // Only a name this handler could have stored: no folders, no other kind of file.
    if (!monsterImageNameIsOurs($filename)) {
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