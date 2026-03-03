<?php
/**
 * Thumbnail generation utilities for Strixhaven portrait images.
 * Uses PHP GD to create proportionally-scaled WebP thumbnails.
 */

/**
 * Generate a proportionally-scaled WebP thumbnail from a source image.
 *
 * @param string $sourcePath  Path to the source image
 * @param string $thumbDir    Directory to store thumbnails
 * @param int    $maxSize     Max dimension (longest side) in pixels
 * @return string|false       Path to generated thumbnail, or false on failure
 */
function generateThumbnail($sourcePath, $thumbDir, $maxSize = 320) {
    if (!file_exists($sourcePath)) return false;

    if (!is_dir($thumbDir)) {
        if (!mkdir($thumbDir, 0755, true)) return false;
    }

    $imageInfo = getimagesize($sourcePath);
    if (!$imageInfo) return false;

    $mime = $imageInfo['mime'];
    switch ($mime) {
        case 'image/jpeg': $source = imagecreatefromjpeg($sourcePath); break;
        case 'image/png':  $source = imagecreatefrompng($sourcePath); break;
        case 'image/gif':  $source = imagecreatefromgif($sourcePath); break;
        case 'image/webp': $source = imagecreatefromwebp($sourcePath); break;
        case 'image/bmp':  $source = imagecreatefrombmp($sourcePath); break;
        default: return false;
    }

    if (!$source) return false;

    $origW = imagesx($source);
    $origH = imagesy($source);

    // Proportional scaling - preserve aspect ratio
    if ($origW >= $origH) {
        $newW = $maxSize;
        $newH = intval($origH * ($maxSize / $origW));
    } else {
        $newH = $maxSize;
        $newW = intval($origW * ($maxSize / $origH));
    }

    // Don't upscale if the image is already smaller
    if ($origW <= $maxSize && $origH <= $maxSize) {
        $newW = $origW;
        $newH = $origH;
    }

    $thumb = imagecreatetruecolor($newW, $newH);

    // Preserve transparency
    imagealphablending($thumb, false);
    imagesavealpha($thumb, true);

    imagecopyresampled($thumb, $source, 0, 0, 0, 0, $newW, $newH, $origW, $origH);

    // Generate thumbnail filename
    $baseName = pathinfo(basename($sourcePath), PATHINFO_FILENAME);
    $thumbFilename = $baseName . '_thumb.webp';
    $thumbPath = $thumbDir . '/' . $thumbFilename;

    $success = imagewebp($thumb, $thumbPath, 80);

    imagedestroy($source);
    imagedestroy($thumb);

    return $success ? $thumbPath : false;
}

/**
 * Get the expected thumbnail path for an image.
 * Converts portraits/xxx.ext -> thumbnails/xxx_thumb.webp
 *
 * @param string $imagePath  Original image path (e.g. portraits/student_xxx.png)
 * @return string            Expected thumbnail path (e.g. thumbnails/student_xxx_thumb.webp)
 */
function getThumbnailPath($imagePath) {
    $baseName = pathinfo(basename($imagePath), PATHINFO_FILENAME);
    $dir = dirname($imagePath);
    $thumbDir = preg_replace('/portraits$/', 'thumbnails', $dir);
    return $thumbDir . '/' . $baseName . '_thumb.webp';
}
