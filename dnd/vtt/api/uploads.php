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

// When noResize is set the image is already at display resolution (e.g. overlay
// cutouts rendered from the already-doubled map).  Skip the doubling step and
// allow up to the final 12000px limit.  Normal uploads are limited to 6000px
// because the server doubles them (final max: 12000x12000).
$noResize = !empty($_POST['noResize']);
$maxDimension = $noResize ? 12000 : 6000;

if ($width > $maxDimension || $height > $maxDimension) {
    $limitLabel = number_format($maxDimension);
    http_response_code(413);
    echo json_encode([
        'success' => false,
        'error' => "Map dimensions exceed the supported {$limitLabel} x {$limitLabel} pixel limit"
            . ($noResize ? '.' : ' (images are doubled for better grid display).'),
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

if ($noResize) {
    // Image is already at display resolution — save as-is.
    $finalWidth = $width;
    $finalHeight = $height;

    $sourceImage = loadImageFromFile($tmpPath, $imageType);
    if ($sourceImage === null) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to process the uploaded image.',
        ]);
        return;
    }

    // Preserve transparency for PNG and GIF
    if ($imageType === IMAGETYPE_PNG || $imageType === IMAGETYPE_GIF) {
        imagealphablending($sourceImage, false);
        imagesavealpha($sourceImage, true);
    }

    $filename = sprintf('%s_%dx%d.%s', $basename, $finalWidth, $finalHeight, $extension);
    $destinationPath = $destinationDir . '/' . $filename;

    if (!saveImageToFile($sourceImage, $destinationPath, $imageType)) {
        imagedestroy($sourceImage);
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Unable to save the map to disk.',
        ]);
        return;
    }

    imagedestroy($sourceImage);
} else {
    // Double the image dimensions for better grid/token display
    $finalWidth = $width * 2;
    $finalHeight = $height * 2;

    $sourceImage = loadImageFromFile($tmpPath, $imageType);
    if ($sourceImage === null) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to process the uploaded image.',
        ]);
        return;
    }

    $doubledImage = imagecreatetruecolor($finalWidth, $finalHeight);
    if ($doubledImage === false) {
        imagedestroy($sourceImage);
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to create doubled image canvas.',
        ]);
        return;
    }

    // Preserve transparency for PNG and GIF
    if ($imageType === IMAGETYPE_PNG || $imageType === IMAGETYPE_GIF) {
        imagealphablending($doubledImage, false);
        imagesavealpha($doubledImage, true);
        $transparent = imagecolorallocatealpha($doubledImage, 0, 0, 0, 127);
        imagefill($doubledImage, 0, 0, $transparent);
    }

    // Resample source to doubled size
    imagecopyresampled(
        $doubledImage,
        $sourceImage,
        0, 0,    // dest x, y
        0, 0,    // src x, y
        $finalWidth, $finalHeight,  // dest width, height
        $width, $height             // src width, height
    );

    imagedestroy($sourceImage);

    $filename = sprintf('%s_%dx%d.%s', $basename, $finalWidth, $finalHeight, $extension);
    $destinationPath = $destinationDir . '/' . $filename;

    if (!saveImageToFile($doubledImage, $destinationPath, $imageType)) {
        imagedestroy($doubledImage);
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Unable to save the doubled map to disk.',
        ]);
        return;
    }

    imagedestroy($doubledImage);
}

$publicUrl = '/dnd/vtt/storage/uploads/' . $filename;

withVttBoardStateLock(function () use ($publicUrl) {
    $boardState = loadVttJson('board-state.json');
    if (!is_array($boardState) || array_values($boardState) === $boardState) {
        $boardState = [];
    }
    $boardState['mapUrl'] = $publicUrl;
    if (!saveVttJson('board-state.json', $boardState)) {
        // Do not fail the upload if the board state cannot be persisted.
        error_log('[VTT] Unable to persist board-state.json after map upload.');
    }
});

echo json_encode([
    'success' => true,
    'data' => [
        'url' => $publicUrl,
        'width' => $finalWidth,
        'height' => $finalHeight,
        'originalWidth' => $width,
        'originalHeight' => $height,
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

/**
 * Loads an image from file based on its type.
 */
function loadImageFromFile(string $path, int $imageType): ?GdImage
{
    $image = match ($imageType) {
        IMAGETYPE_GIF => @imagecreatefromgif($path),
        IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
        IMAGETYPE_PNG => @imagecreatefrompng($path),
        IMAGETYPE_WEBP => @imagecreatefromwebp($path),
        default => false,
    };

    return $image instanceof GdImage ? $image : null;
}

/**
 * Saves a GD image to file based on the target type.
 */
function saveImageToFile(GdImage $image, string $path, int $imageType): bool
{
    return match ($imageType) {
        IMAGETYPE_GIF => @imagegif($image, $path),
        IMAGETYPE_JPEG => @imagejpeg($image, $path, 90), // 90% quality
        IMAGETYPE_PNG => @imagepng($image, $path, 6),    // Compression level 6
        IMAGETYPE_WEBP => @imagewebp($image, $path, 90), // 90% quality
        default => false,
    };
}
