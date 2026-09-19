<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/includes/portrait-upload.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        throw new RuntimeException('Use POST to upload a portrait.');
    }
    if (($_SESSION['logged_in'] ?? false) !== true) {
        throw new RuntimeException('Not logged in');
    }
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        throw new RuntimeException('Cross-site uploads are not allowed.');
    }
    $user = $_SESSION['user'] ?? '';
    $character = $_POST['character'] ?? '';
    if (!is_string($character) || !in_array($character, ['cal', 'sharon', 'indigo', 'zepha'], true)) {
        throw new RuntimeException('Invalid character');
    }
    if ($user !== 'GM' && $character !== $user) {
        throw new RuntimeException('Permission denied');
    }
    $upload = $_FILES['portrait'] ?? null;
    if (!is_array($upload) || ($upload['error'] ?? null) !== UPLOAD_ERR_OK || !is_string($upload['tmp_name'] ?? null) || !is_uploaded_file($upload['tmp_name'])) {
        throw new RuntimeException('No file uploaded or upload error');
    }
    $png = encodePortrait($upload['tmp_name']);
    $path = savePortrait(__DIR__, $character, $png);
    echo json_encode(['success' => true, 'portrait_path' => $path, 'message' => 'Portrait uploaded successfully']);
} catch (Throwable $error) {
    $message = $error instanceof RuntimeException ? $error->getMessage() : 'The portrait could not be saved. Existing character data has been preserved.';
    echo json_encode(['success' => false, 'error' => $message]);
}
