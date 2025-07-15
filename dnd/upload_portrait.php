<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not logged in'));
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Only allow uploads if user is GM or uploading to their own character
$character = isset($_POST['character']) ? $_POST['character'] : '';
$characters = array('frunk', 'sharon', 'indigo', 'zepha');

if (!in_array($character, $characters)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid character'));
    exit;
}

// Check permissions: GM can upload for any character, users can only upload for themselves
if (!$is_gm && $character !== $user) {
    echo json_encode(array('success' => false, 'error' => 'Permission denied'));
    exit;
}

// Check if file was uploaded
if (!isset($_FILES['portrait']) || $_FILES['portrait']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(array('success' => false, 'error' => 'No file uploaded or upload error'));
    exit;
}

$uploadedFile = $_FILES['portrait'];

// Validate file type
$allowedTypes = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp');
$fileType = $uploadedFile['type'];

if (!in_array($fileType, $allowedTypes)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid file type. Only JPG, PNG, GIF, BMP, and WebP images are allowed.'));
    exit;
}

// Validate file size (max 5MB)
$maxSize = 5 * 1024 * 1024; // 5MB in bytes
if ($uploadedFile['size'] > $maxSize) {
    echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
    exit;
}

// Create portraits directory if it doesn't exist
$portraitsDir = 'portraits';
if (!is_dir($portraitsDir)) {
    mkdir($portraitsDir, 0755, true);
}

// Generate unique filename
$fileExtension = pathinfo($uploadedFile['name'], PATHINFO_EXTENSION);
$fileName = $character . '_portrait_' . time() . '.' . $fileExtension;
$filePath = $portraitsDir . '/' . $fileName;

// Move uploaded file
if (move_uploaded_file($uploadedFile['tmp_name'], $filePath)) {
    // Update character data with portrait path
    $dataFile = 'data/characters.json';
    $data = array();
    
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if (!$data) {
            $data = array();
        }
    }
    
    // Initialize character data if it doesn't exist
    if (!isset($data[$character])) {
        $data[$character] = array();
    }
    if (!isset($data[$character]['character'])) {
        $data[$character]['character'] = array();
    }
    
    // Remove old portrait file if it exists
    if (isset($data[$character]['character']['portrait']) && 
        file_exists($data[$character]['character']['portrait'])) {
        unlink($data[$character]['character']['portrait']);
    }
    
    // Save new portrait path
    $data[$character]['character']['portrait'] = $filePath;
    
    // Save updated data
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    if (file_put_contents($dataFile, $jsonData)) {
        echo json_encode(array(
            'success' => true, 
            'portrait_path' => $filePath,
            'message' => 'Portrait uploaded successfully'
        ));
    } else {
        // Delete uploaded file if we can't update the data
        unlink($filePath);
        echo json_encode(array('success' => false, 'error' => 'Failed to save portrait data'));
    }
} else {
    echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
}
?>