<?php
// Decode and re-encode uploads; never preserve client filenames or file contents.
function encodePortrait(string $source): string {
    if (!function_exists('imagecreatefromstring')) {
        throw new RuntimeException('Image processing is unavailable. Please contact the administrator.');
    }
    $size = filesize($source);
    if ($size === false || $size < 1 || $size > 5 * 1024 * 1024) {
        throw new RuntimeException('Please choose an image smaller than 5 MB.');
    }
    $info = @getimagesize($source);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_BMP, IMAGETYPE_WEBP], true)) {
        throw new RuntimeException('Please choose a valid JPG, PNG, GIF, BMP, or WebP image.');
    }
    if ($info[0] < 1 || $info[1] < 1 || $info[0] > 4096 || $info[1] > 4096 || $info[0] * $info[1] > 8000000) {
        throw new RuntimeException('Image dimensions are too large. Maximum: 4096 pixels per side and 8 megapixels.');
    }
    $image = @imagecreatefromstring(file_get_contents($source));
    if ($image === false) {
        throw new RuntimeException('The image could not be read.');
    }
    imagesavealpha($image, true);
    ob_start();
    try {
        if (!imagepng($image)) {
            throw new RuntimeException('The image could not be processed.');
        }
        return ob_get_contents();
    } finally {
        ob_end_clean();
        imagedestroy($image);
    }
}

function savePortrait(string $root, string $character, string $png): string {
    $directory = $root . '/portraits';
    if (!is_dir($directory) && !mkdir($directory, 0755, true)) {
        throw new RuntimeException('Portrait storage is unavailable.');
    }
    $relative = 'portraits/' . $character . '_portrait_' . bin2hex(random_bytes(16)) . '.png';
    $path = $root . '/' . $relative;
    $lock = fopen($root . '/data/characters.lock', 'c+');
    if (!$lock) {
        throw new RuntimeException('Character storage is unavailable.');
    }
    $temporary = null;
    $created = false;
    $saved = false;
    try {
        if (!flock($lock, LOCK_EX)) {
            throw new RuntimeException('Character data is busy. Please try again.');
        }
        $dataFile = $root . '/data/characters.json';
        $data = json_decode(file_get_contents($dataFile), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !isset($data[$character]) || !is_array($data[$character])) {
            throw new RuntimeException('Character data is unavailable.');
        }
        $created = true;
        if (file_put_contents($path, $png, LOCK_EX) !== strlen($png)) {
            throw new RuntimeException('The portrait could not be saved.');
        }
        $data[$character]['character']['portrait'] = $relative;
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $temporary = tempnam($root . '/data', 'portrait-');
        if ($temporary === false || file_put_contents($temporary, $json) !== strlen($json) || !rename($temporary, $dataFile)) {
            throw new RuntimeException('Character data could not be saved.');
        }
        $temporary = null;
        $saved = true;
        // Existing portraits remain intact; never delete a path supplied by stored data.
        return $relative;
    } finally {
        if ($temporary && is_file($temporary)) { unlink($temporary); }
        if ($created && !$saved && is_file($path)) { unlink($path); }
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
