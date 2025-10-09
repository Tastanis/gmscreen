<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (strtoupper($method) !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Only POST requests are supported for uploads.',
    ]);
    return;
}

$auth = getVttUserContext();
if (!($auth['isLoggedIn'] ?? false)) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Authentication required.',
    ]);
    return;
}

if (!($auth['isGM'] ?? false)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Only the GM can upload scene maps.',
    ]);
    return;
}

if (!isset($_FILES['map'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'No map image was provided.',
    ]);
    return;
}

$file = $_FILES['map'];

if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'The map upload is missing or invalid.',
    ]);
    return;
}

$uploadError = $file['error'] ?? UPLOAD_ERR_OK;
if ($uploadError !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => uploadErrorMessage($uploadError),
    ]);
    return;
}

$tmpPath = $file['tmp_name'] ?? '';
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Uploaded file could not be processed.',
    ]);
    return;
}

$maxBytes = 40 * 1024 * 1024; // 40 MB ceiling for very large maps.
$size = (int) ($file['size'] ?? 0);
if ($size <= 0 || $size > $maxBytes) {
    http_response_code(413);
    echo json_encode([
        'success' => false,
        'error' => 'Map images must be smaller than 40 MB.',
    ]);
    return;
}

$imageInfo = @getimagesize($tmpPath);
if ($imageInfo === false) {
    http_response_code(415);
    echo json_encode([
        'success' => false,
        'error' => 'Only valid image files can be used as scene maps.',
    ]);
    return;
}

[$width, $height, $imageType] = $imageInfo;
if ($width > 12000 || $height > 12000) {
    http_response_code(413);
    echo json_encode([
        'success' => false,
        'error' => 'Map dimensions exceed the supported 12,000 x 12,000 pixel limit.',
    ]);
    return;
}

$extension = imageTypeToExtension($imageType);
if ($extension === null) {
    http_response_code(415);
    echo json_encode([
        'success' => false,
        'error' => 'Unsupported image format for scene maps.',
    ]);
    return;
}

$destinationDir = __DIR__ . '/../storage/uploads';
if (!is_dir($destinationDir) && !mkdir($destinationDir, 0775, true) && !is_dir($destinationDir)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Unable to prepare storage for map uploads.',
    ]);
    return;
}

try {
    $basename = bin2hex(random_bytes(12));
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to generate a safe filename for the map.',
    ]);
    return;
}

$filename = sprintf('%s_%dx%d.%s', $basename, $width, $height, $extension);
$destinationPath = $destinationDir . '/' . $filename;

if (!move_uploaded_file($tmpPath, $destinationPath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Unable to save the uploaded map to disk.',
    ]);
    return;
}

$publicUrl = '/dnd/vtt/storage/uploads/' . $filename;

$boardState = loadVttJson('board-state.json');
if (!is_array($boardState) || array_values($boardState) === $boardState) {
    $boardState = [];
}
$boardState['mapUrl'] = $publicUrl;
if (!saveVttJson('board-state.json', $boardState)) {
    // Do not fail the upload if the board state cannot be persisted.
    error_log('[VTT] Unable to persist board-state.json after map upload.');
}

echo json_encode([
    'success' => true,
    'data' => [
        'url' => $publicUrl,
        'width' => $width,
        'height' => $height,
    ],
]);

/**
 * Maps GD image type constants to usable extensions.
 */
function imageTypeToExtension(int $type): ?string
{
    switch ($type) {
        case IMAGETYPE_GIF:
            return 'gif';
        case IMAGETYPE_JPEG:
            return 'jpg';
        case IMAGETYPE_PNG:
            return 'png';
        case IMAGETYPE_WEBP:
            return 'webp';
        default:
            return null;
    }
}

function uploadErrorMessage(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'The uploaded map exceeds the server size limit.',
        UPLOAD_ERR_PARTIAL => 'The map upload was only partially completed.',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing a temporary folder on the server.',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write the map image to disk.',
        UPLOAD_ERR_EXTENSION => 'A server extension stopped the upload.',
        default => 'The map upload failed due to an unexpected error.',
    };
}
