<?php

declare(strict_types=1);

require_once __DIR__ . '/scenes_repository.php';

const VTT_TOKEN_LIBRARY_FILE = __DIR__ . '/../data/vtt_token_library.json';
const VTT_SCENE_TOKENS_FILE = __DIR__ . '/../data/vtt_scene_tokens.json';

/**
 * Load the token library entries from disk.
 */
function loadTokenLibrary(): array
{
    ensureTokenLibraryFile();

    $raw = @file_get_contents(VTT_TOKEN_LIBRARY_FILE);
    if ($raw === false) {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return normalizeTokenLibraryEntries($decoded);
}

/**
 * Persist the token library to disk and return the normalized payload.
 */
function saveTokenLibrary(array $tokens): ?array
{
    ensureTokenLibraryFile();

    $normalized = normalizeTokenLibraryEntries($tokens);
    $payload = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        return null;
    }

    if (!writeFileWithLock(VTT_TOKEN_LIBRARY_FILE, $payload)) {
        return null;
    }

    recordTokenLibraryChange();

    return $normalized;
}

/**
 * Load the scene token entries for a specific scene.
 */
function loadSceneTokensByScene(string $sceneId): array
{
    $sceneId = trim($sceneId);
    if ($sceneId === '') {
        return [];
    }

    $state = loadSceneTokenState();
    $tokens = $state[$sceneId] ?? [];

    if (!is_array($tokens)) {
        return [];
    }

    return normalizeSceneTokenEntries($tokens);
}

/**
 * Save scene tokens for a given scene and return the normalized payload.
 */
function saveSceneTokensByScene(string $sceneId, array $tokens): ?array
{
    $sceneId = trim($sceneId);
    if ($sceneId === '') {
        return null;
    }

    $state = loadSceneTokenState();
    $normalized = normalizeSceneTokenEntries($tokens);
    $state[$sceneId] = $normalized;

    $payload = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        return null;
    }

    if (!writeFileWithLock(VTT_SCENE_TOKENS_FILE, $payload)) {
        return null;
    }

    recordSceneTokensChange($sceneId);

    return $normalized;
}

function ensureTokenLibraryFile(): void
{
    $directory = dirname(VTT_TOKEN_LIBRARY_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_TOKEN_LIBRARY_FILE)) {
        file_put_contents(VTT_TOKEN_LIBRARY_FILE, json_encode([], JSON_PRETTY_PRINT), LOCK_EX);
    }
}

function ensureSceneTokenFile(): void
{
    $directory = dirname(VTT_SCENE_TOKENS_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_SCENE_TOKENS_FILE)) {
        file_put_contents(VTT_SCENE_TOKENS_FILE, json_encode([], JSON_PRETTY_PRINT), LOCK_EX);
    }
}

function loadSceneTokenState(): array
{
    ensureSceneTokenFile();

    $raw = @file_get_contents(VTT_SCENE_TOKENS_FILE);
    if ($raw === false) {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    $state = [];
    foreach ($decoded as $sceneId => $tokens) {
        if (!is_string($sceneId) || $sceneId === '') {
            continue;
        }
        if (!is_array($tokens)) {
            continue;
        }
        $state[$sceneId] = normalizeSceneTokenEntries($tokens);
    }

    return $state;
}

function normalizeTokenLibraryEntries($entries): array
{
    if (!is_array($entries)) {
        return [];
    }

    $normalized = [];
    foreach ($entries as $entry) {
        $normalizedEntry = normalizeTokenLibraryEntry($entry);
        if ($normalizedEntry !== null) {
            $normalized[] = $normalizedEntry;
        }
    }

    return $normalized;
}

function normalizeTokenLibraryEntry($entry): ?array
{
    if (!is_array($entry)) {
        return null;
    }

    $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
    if ($id === '') {
        $id = generateIdentifier('token');
    }

    $name = isset($entry['name']) ? trim((string) $entry['name']) : '';
    if ($name === '') {
        return null;
    }

    $imageData = isset($entry['imageData']) ? (string) $entry['imageData'] : '';
    if ($imageData === '') {
        return null;
    }

    $allowedFolders = ['pcs', 'npcs', 'monsters'];
    $folderId = isset($entry['folderId']) ? (string) $entry['folderId'] : 'pcs';
    if (!in_array($folderId, $allowedFolders, true)) {
        $folderId = 'pcs';
    }

    $allowedSchools = ['lorehold', 'prismari', 'quandrix', 'silverquill', 'witherbloom', 'other'];
    $schoolId = isset($entry['schoolId']) ? (string) $entry['schoolId'] : 'other';
    if (!in_array($schoolId, $allowedSchools, true)) {
        $schoolId = 'other';
    }

    $size = isset($entry['size']) && is_array($entry['size']) ? $entry['size'] : [];
    $width = clampTokenDimension($size['width'] ?? null);
    $height = clampTokenDimension($size['height'] ?? null);

    $stamina = clampTokenStamina($entry['stamina'] ?? 0);

    $createdAt = normalizeTimestamp($entry['createdAt'] ?? null);
    $updatedAt = normalizeTimestamp($entry['updatedAt'] ?? $createdAt);

    return [
        'id' => $id,
        'name' => $name,
        'folderId' => $folderId,
        'schoolId' => $schoolId,
        'size' => [
            'width' => $width,
            'height' => $height,
        ],
        'stamina' => $stamina,
        'imageData' => $imageData,
        'createdAt' => $createdAt,
        'updatedAt' => $updatedAt,
    ];
}

function normalizeSceneTokenEntries($entries): array
{
    if (!is_array($entries)) {
        return [];
    }

    $normalized = [];
    foreach ($entries as $entry) {
        $normalizedEntry = normalizeSceneTokenEntry($entry);
        if ($normalizedEntry !== null) {
            $normalized[] = $normalizedEntry;
        }
    }

    return $normalized;
}

function normalizeSceneTokenEntry($entry): ?array
{
    if (!is_array($entry)) {
        return null;
    }

    $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
    $imageData = isset($entry['imageData']) ? (string) $entry['imageData'] : '';
    if ($id === '' || $imageData === '') {
        return null;
    }

    $name = isset($entry['name']) ? (string) $entry['name'] : '';
    $libraryId = isset($entry['libraryId']) ? (string) $entry['libraryId'] : '';
    $stamina = clampTokenStamina($entry['stamina'] ?? 0);

    $size = isset($entry['size']) && is_array($entry['size']) ? $entry['size'] : [];
    $width = clampTokenDimension($size['width'] ?? null);
    $height = clampTokenDimension($size['height'] ?? null);

    $position = isset($entry['position']) && is_array($entry['position']) ? $entry['position'] : [];
    $x = normalizeCoordinate($position['x'] ?? 0);
    $y = normalizeCoordinate($position['y'] ?? 0);

    return [
        'id' => $id,
        'libraryId' => $libraryId,
        'name' => $name,
        'imageData' => $imageData,
        'stamina' => $stamina,
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

function clampTokenDimension($value): int
{
    if (is_int($value)) {
        $numeric = $value;
    } elseif (is_float($value) || is_numeric($value)) {
        $numeric = (int) round((float) $value);
    } else {
        $numeric = 1;
    }

    if ($numeric < 1) {
        return 1;
    }
    if ($numeric > 12) {
        return 12;
    }

    return $numeric;
}

function clampTokenStamina($value): int
{
    if (!is_numeric($value)) {
        return 0;
    }

    $numeric = (int) round((float) $value);
    if ($numeric < 0) {
        return 0;
    }

    return $numeric;
}

function normalizeTimestamp($value): int
{
    if (!is_numeric($value)) {
        return (int) floor(microtime(true) * 1000);
    }

    $timestamp = (int) round((float) $value);
    if ($timestamp < 0) {
        $timestamp = 0;
    }

    return $timestamp;
}

function normalizeCoordinate($value): float
{
    if (!is_numeric($value)) {
        return 0.0;
    }

    $numeric = (float) $value;
    if ($numeric < 0) {
        $numeric = 0.0;
    }

    return round($numeric, 4);
}

function writeFileWithLock(string $filePath, string $contents): bool
{
    $fp = fopen($filePath, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $bytes = fwrite($fp, $contents);
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytes !== false;
    }

    fclose($fp);

    return $result;
}

function recordTokenLibraryChange(): void
{
    appendChangeLogEntry([
        'entityType' => 'token_library',
        'entityId' => 'library',
        'operation' => 'updated',
        'version' => null,
        'payload' => [
            'updatedAt' => currentUtcTimestamp(),
        ],
    ]);
}

function recordSceneTokensChange(string $sceneId): void
{
    appendChangeLogEntry([
        'entityType' => 'scene_tokens',
        'entityId' => $sceneId,
        'operation' => 'updated',
        'version' => null,
        'payload' => [
            'sceneId' => $sceneId,
            'updatedAt' => currentUtcTimestamp(),
        ],
    ]);
}
