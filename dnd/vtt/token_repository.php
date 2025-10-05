<?php

declare(strict_types=1);

const VTT_TOKEN_LIBRARY_FILE = __DIR__ . '/../data/vtt_tokens.json';
const VTT_SCENE_TOKENS_FILE = __DIR__ . '/../data/vtt_scene_tokens.json';

/**
 * Ensure the token library storage file exists on disk.
 */
function ensureTokenLibraryFile(): void
{
    $directory = dirname(VTT_TOKEN_LIBRARY_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_TOKEN_LIBRARY_FILE)) {
        file_put_contents(
            VTT_TOKEN_LIBRARY_FILE,
            json_encode(['tokens' => []], JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}

/**
 * Ensure the scene token storage file exists on disk.
 */
function ensureSceneTokensFile(): void
{
    $directory = dirname(VTT_SCENE_TOKENS_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_SCENE_TOKENS_FILE)) {
        file_put_contents(
            VTT_SCENE_TOKENS_FILE,
            json_encode(['scenes' => new stdClass()], JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}

/**
 * Load and normalize the full token library dataset.
 */
function loadTokenLibrary(): array
{
    ensureTokenLibraryFile();

    $tokens = [];
    $fp = fopen(VTT_TOKEN_LIBRARY_FILE, 'c+');
    if ($fp === false) {
        return $tokens;
    }

    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['tokens']) && is_array($decoded['tokens'])) {
                $tokens = $decoded['tokens'];
            }
        }
        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return normalizeTokenLibraryEntries($tokens);
}

/**
 * Persist the provided token library entries.
 */
function saveTokenLibrary(array $tokens): bool
{
    ensureTokenLibraryFile();

    $normalized = normalizeTokenLibraryEntries($tokens);
    $payload = json_encode(['tokens' => $normalized], JSON_PRETTY_PRINT);
    if ($payload === false) {
        return false;
    }

    $fp = fopen(VTT_TOKEN_LIBRARY_FILE, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $bytesWritten = fwrite($fp, $payload);
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytesWritten !== false;
    }

    fclose($fp);

    return $result;
}

/**
 * Load the tokens for a specific scene.
 */
function loadSceneTokens(string $sceneId): array
{
    if ($sceneId === '') {
        return [];
    }

    $all = loadAllSceneTokens();
    $sceneTokens = [];
    if (isset($all[$sceneId]) && is_array($all[$sceneId])) {
        $sceneTokens = $all[$sceneId];
    }

    return normalizeSceneTokenEntries($sceneTokens);
}

/**
 * Persist the tokens for a specific scene while keeping other scene entries intact.
 */
function saveSceneTokens(string $sceneId, array $tokens): bool
{
    if ($sceneId === '') {
        return false;
    }

    ensureSceneTokensFile();
    $normalized = normalizeSceneTokenEntries($tokens);

    $fp = fopen(VTT_SCENE_TOKENS_FILE, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        $content = stream_get_contents($fp);
        $data = ['scenes' => []];
        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['scenes']) && is_array($decoded['scenes'])) {
                $data['scenes'] = $decoded['scenes'];
            }
        }

        $data['scenes'][$sceneId] = $normalized;

        $payload = json_encode(['scenes' => $data['scenes']], JSON_PRETTY_PRINT);
        if ($payload !== false) {
            ftruncate($fp, 0);
            rewind($fp);
            $bytesWritten = fwrite($fp, $payload);
            fflush($fp);
            $result = $bytesWritten !== false;
        }

        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return $result;
}

/**
 * Return only the token entries intended for non-GM players.
 */
function filterTokensForPlayers(array $tokens): array
{
    return array_values(array_filter($tokens, function ($token) {
        if (!is_array($token)) {
            return false;
        }
        $folder = isset($token['folderId']) ? (string) $token['folderId'] : '';
        return $folder === 'pcs';
    }));
}

/**
 * Normalize an array of token library entries.
 */
function normalizeTokenLibraryEntries(array $entries): array
{
    $allowedFolders = ['pcs', 'npcs', 'monsters'];
    $allowedSchools = ['lorehold', 'prismari', 'quandrix', 'silverquill', 'witherbloom', 'other'];

    $normalized = [];
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = isset($entry['name']) ? trim((string) $entry['name']) : '';
        $imageData = isset($entry['imageData']) ? (string) $entry['imageData'] : '';
        if ($name === '' || $imageData === '') {
            continue;
        }

        $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
        if ($id === '') {
            $id = generateTokenIdentifier('token');
        }

        $folderId = isset($entry['folderId']) ? (string) $entry['folderId'] : 'pcs';
        if (!in_array($folderId, $allowedFolders, true)) {
            $folderId = 'pcs';
        }

        $schoolId = isset($entry['schoolId']) ? (string) $entry['schoolId'] : 'other';
        if (!in_array($schoolId, $allowedSchools, true)) {
            $schoolId = 'other';
        }

        $size = isset($entry['size']) && is_array($entry['size']) ? $entry['size'] : [];
        $width = clampTokenDimension($size['width'] ?? 1);
        $height = clampTokenDimension($size['height'] ?? 1);

        $staminaValue = isset($entry['stamina']) ? (int) round((float) $entry['stamina']) : 0;
        if ($staminaValue < 0) {
            $staminaValue = 0;
        }

        $createdAt = isset($entry['createdAt']) ? (int) $entry['createdAt'] : time();
        $updatedAt = isset($entry['updatedAt']) ? (int) $entry['updatedAt'] : $createdAt;
        if ($updatedAt < $createdAt) {
            $updatedAt = $createdAt;
        }

        $normalized[] = [
            'id' => $id,
            'name' => $name,
            'folderId' => $folderId,
            'schoolId' => $schoolId,
            'size' => [
                'width' => $width,
                'height' => $height,
            ],
            'stamina' => $staminaValue,
            'imageData' => $imageData,
            'createdAt' => $createdAt,
            'updatedAt' => $updatedAt,
        ];
    }

    return $normalized;
}

/**
 * Normalize an array of scene token entries.
 */
function normalizeSceneTokenEntries(array $entries): array
{
    $normalized = [];
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
        $imageData = isset($entry['imageData']) ? (string) $entry['imageData'] : '';
        if ($id === '' || $imageData === '') {
            continue;
        }

        $libraryId = isset($entry['libraryId']) ? (string) $entry['libraryId'] : '';
        $name = isset($entry['name']) ? (string) $entry['name'] : '';

        $size = isset($entry['size']) && is_array($entry['size']) ? $entry['size'] : [];
        $width = clampTokenDimension($size['width'] ?? 1);
        $height = clampTokenDimension($size['height'] ?? 1);

        $position = isset($entry['position']) && is_array($entry['position']) ? $entry['position'] : [];
        $x = isset($position['x']) ? (float) $position['x'] : 0.0;
        $y = isset($position['y']) ? (float) $position['y'] : 0.0;

        $staminaValue = isset($entry['stamina']) ? (int) round((float) $entry['stamina']) : 0;
        if ($staminaValue < 0) {
            $staminaValue = 0;
        }

        $normalized[] = [
            'id' => $id,
            'libraryId' => $libraryId,
            'name' => $name,
            'imageData' => $imageData,
            'stamina' => $staminaValue,
            'size' => [
                'width' => $width,
                'height' => $height,
            ],
            'position' => [
                'x' => $x,
                'y' => $y,
            ],
        ];
    }

    return $normalized;
}

/**
 * Load every scene token mapping from disk.
 */
function loadAllSceneTokens(): array
{
    ensureSceneTokensFile();

    $fp = fopen(VTT_SCENE_TOKENS_FILE, 'c+');
    if ($fp === false) {
        return [];
    }

    $scenes = [];
    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['scenes']) && is_array($decoded['scenes'])) {
                $scenes = $decoded['scenes'];
            }
        }
        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return is_array($scenes) ? $scenes : [];
}

/**
 * Clamp token dimensions to a sane range.
 */
function clampTokenDimension($value): int
{
    $numeric = is_numeric($value) ? (int) round((float) $value) : 1;
    if ($numeric < 1) {
        return 1;
    }
    if ($numeric > 12) {
        return 12;
    }
    return $numeric;
}

/**
 * Generate a random identifier for token objects.
 */
function generateTokenIdentifier(string $prefix = 'token'): string
{
    try {
        return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
    } catch (Throwable $exception) {
        return sprintf('%s-%s', $prefix, uniqid('', true));
    }
}
