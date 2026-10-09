<?php
declare(strict_types=1);

/**
 * Takes one uploaded map picture, checks it, and files it under storage/uploads.
 *
 * This is the body of api/uploads.php, moved here unchanged so that the Scenes screen's upload
 * and the key-guarded site upload (dnd/admin/site-upload) run the same code. Who may call it is
 * the caller's business: this class checks the picture, not the person.
 *
 * The picture is decoded and written out again by PHP's image library under a random name, so
 * what lands in the web-readable folder is always a real image this server made, never the bytes
 * that were sent.
 *
 * A caller that sends the same picture again and again (the site upload, replacing a map with a
 * newer version of itself) may ask for the name to follow from the picture: the same bytes then
 * get the same address and are not written twice. A browser keys what a player has explored to
 * the map's address, so an unchanged map keeps that memory.
 */
final class MapImageStore
{
    public const MAX_BYTES = 40 * 1024 * 1024; // 40 MB ceiling for very large maps.
    public const MAX_DIMENSION = 12000;

    /**
     * @param mixed $file one entry of $_FILES
     * @param bool $sameNameForSamePicture name the file after its content, and reuse it if it is there
     * @return array{0:int,1:array} HTTP status and the JSON answer
     */
    public static function store($file, bool $sameNameForSamePicture = false): array
    {
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return [400, ['success' => false, 'error' => 'The map upload is missing or invalid.']];
        }

        $uploadError = $file['error'] ?? UPLOAD_ERR_OK;
        if ($uploadError !== UPLOAD_ERR_OK) {
            return [400, ['success' => false, 'error' => self::uploadErrorMessage((int) $uploadError)]];
        }

        $tmpPath = $file['tmp_name'] ?? '';
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            return [400, ['success' => false, 'error' => 'Uploaded file could not be processed.']];
        }

        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > self::MAX_BYTES) {
            return [413, ['success' => false, 'error' => 'Map images must be smaller than 40 MB.']];
        }

        $imageInfo = @getimagesize($tmpPath);
        if ($imageInfo === false) {
            return [415, ['success' => false, 'error' => 'Only valid image files can be used as scene maps.']];
        }

        [$width, $height, $imageType] = $imageInfo;

        if ($width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION) {
            $limitLabel = number_format(self::MAX_DIMENSION);
            return [413, ['success' => false, 'error' => "Map dimensions exceed the supported {$limitLabel} x {$limitLabel} pixel limit."]];
        }

        $extension = self::imageTypeToExtension($imageType);
        if ($extension === null) {
            return [415, ['success' => false, 'error' => 'Unsupported image format for scene maps.']];
        }

        $destinationDir = __DIR__ . '/../storage/uploads';
        if (!is_dir($destinationDir) && !mkdir($destinationDir, 0775, true) && !is_dir($destinationDir)) {
            return [500, ['success' => false, 'error' => 'Unable to prepare storage for map uploads.']];
        }

        $finalWidth = $width;
        $finalHeight = $height;

        if ($sameNameForSamePicture) {
            $digest = hash_file('sha256', $tmpPath);
            if (!is_string($digest)) {
                return [500, ['success' => false, 'error' => 'Failed to generate a safe filename for the map.']];
            }
            $basename = substr($digest, 0, 24);
            if (is_file($destinationDir . '/' . sprintf('%s_%dx%d.%s', $basename, $width, $height, $extension))) {
                $thumbnail = self::thumbnailSize($width, $height);
                $thumbFilename = $thumbnail === null ? null : sprintf('%s_%dx%d_thumb.jpg', $basename, $thumbnail[0], $thumbnail[1]);
                return [200, [
                    'success' => true,
                    'data' => [
                        'url' => '/dnd/vtt/storage/uploads/' . sprintf('%s_%dx%d.%s', $basename, $width, $height, $extension),
                        'thumbnailUrl' => $thumbFilename !== null && is_file($destinationDir . '/' . $thumbFilename) ? '/dnd/vtt/storage/uploads/' . $thumbFilename : null,
                        'width' => $width,
                        'height' => $height,
                        'originalWidth' => $width,
                        'originalHeight' => $height,
                    ],
                ]];
            }
        } else {
            try {
                $basename = bin2hex(random_bytes(12));
            } catch (Throwable $exception) {
                return [500, ['success' => false, 'error' => 'Failed to generate a safe filename for the map.']];
            }
        }

        $sourceImage = self::loadImageFromFile($tmpPath, $imageType);
        if ($sourceImage === null) {
            return [500, ['success' => false, 'error' => 'Failed to process the uploaded image.']];
        }

        // Preserve transparency for PNG and GIF
        if ($imageType === IMAGETYPE_PNG || $imageType === IMAGETYPE_GIF) {
            imagealphablending($sourceImage, false);
            imagesavealpha($sourceImage, true);
        }

        $filename = sprintf('%s_%dx%d.%s', $basename, $finalWidth, $finalHeight, $extension);
        $destinationPath = $destinationDir . '/' . $filename;

        if (!self::saveImageToFile($sourceImage, $destinationPath, $imageType)) {
            imagedestroy($sourceImage);
            return [500, ['success' => false, 'error' => 'Unable to save the map to disk.']];
        }

        // Generate a small thumbnail for the scene sidebar.
        $thumbnailUrl = null;
        $thumbnail = self::thumbnailSize($finalWidth, $finalHeight);
        if ($thumbnail !== null) {
            [$thumbW, $thumbH] = $thumbnail;

            $thumb = imagecreatetruecolor($thumbW, $thumbH);
            if ($thumb instanceof GdImage) {
                imagecopyresampled($thumb, $sourceImage, 0, 0, 0, 0, $thumbW, $thumbH, $finalWidth, $finalHeight);

                $thumbFilename = sprintf('%s_%dx%d_thumb.jpg', $basename, $thumbW, $thumbH);
                $thumbPath = $destinationDir . '/' . $thumbFilename;
                if (@imagejpeg($thumb, $thumbPath, 70)) {
                    $thumbnailUrl = '/dnd/vtt/storage/uploads/' . $thumbFilename;
                }
                imagedestroy($thumb);
            }
        }

        imagedestroy($sourceImage);

        return [200, [
            'success' => true,
            'data' => [
                'url' => '/dnd/vtt/storage/uploads/' . $filename,
                'thumbnailUrl' => $thumbnailUrl,
                'width' => $finalWidth,
                'height' => $finalHeight,
                'originalWidth' => $width,
                'originalHeight' => $height,
            ],
        ]];
    }

    /** The sidebar thumbnail's size for a picture, or null when the picture is already that small. */
    private static function thumbnailSize(int $width, int $height): ?array
    {
        $thumbMaxWidth = 164;
        $thumbMaxHeight = 124;
        if ($width <= $thumbMaxWidth && $height <= $thumbMaxHeight) {
            return null;
        }
        $scale = min($thumbMaxWidth / $width, $thumbMaxHeight / $height);
        return [(int) round($width * $scale), (int) round($height * $scale)];
    }

    /** Maps GD image type constants to usable extensions. */
    private static function imageTypeToExtension(int $type): ?string
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

    private static function uploadErrorMessage(int $code): string
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

    /** Loads an image from file based on its type. */
    private static function loadImageFromFile(string $path, int $imageType): ?GdImage
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

    /** Saves a GD image to file based on the target type. */
    private static function saveImageToFile(GdImage $image, string $path, int $imageType): bool
    {
        return match ($imageType) {
            IMAGETYPE_GIF => @imagegif($image, $path),
            IMAGETYPE_JPEG => @imagejpeg($image, $path, 90), // 90% quality
            IMAGETYPE_PNG => @imagepng($image, $path, 6),    // Compression level 6
            IMAGETYPE_WEBP => @imagewebp($image, $path, 90), // 90% quality
            default => false,
        };
    }
}
