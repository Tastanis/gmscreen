<?php
declare(strict_types=1);

/**
 * The rubble pictures drawn over broken walls. Whatever files in the rubble folder are named
 * rubble-<kind>-<number>.png (or .webp) are offered to the page; adding a picture needs no code
 * change. A kind with no picture is drawn by the page itself (wall-rubble.mjs).
 */
final class RubbleImages
{
    public const KINDS = ['stone', 'wood', 'glass', 'metal', 'door', 'window', 'heap'];

    /** Addresses of the pictures, in name order, each with its file time so a replaced picture is fetched again. */
    public static function urls(string $directory, string $baseUrl): array
    {
        if (!is_dir($directory)) return [];
        $urls = [];
        $names = scandir($directory) ?: [];
        natcasesort($names);
        foreach ($names as $name) {
            if (!preg_match('/^rubble-(' . implode('|', self::KINDS) . ')-(\d{1,3})\.(png|webp)$/', $name)) continue;
            $path = $directory . DIRECTORY_SEPARATOR . $name;
            if (!is_file($path)) continue;
            $urls[] = rtrim($baseUrl, '/') . '/' . $name . '?v=' . (int) filemtime($path);
        }
        return $urls;
    }
}
