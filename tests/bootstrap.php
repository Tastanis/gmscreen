<?php

declare(strict_types=1);

function normalizeSceneTokenEntries(array $entries): array
{
    $normalized = [];

    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
        if ($id === '') {
            continue;
        }

        $normalizedEntry = $entry;

        $imageData = isset($entry['imageData']) && is_string($entry['imageData'])
            ? trim($entry['imageData'])
            : '';
        if ($imageData !== '') {
            if (!tokenRepositoryIsValidImageData($imageData)) {
                continue;
            }
            $normalizedEntry['imageData'] = $imageData;
        }

        $position = isset($entry['position']) && is_array($entry['position']) ? $entry['position'] : [];
        $normalizedEntry['position'] = [
            'x' => tokenRepositorySanitizeFloat($position['x'] ?? 0.0),
            'y' => tokenRepositorySanitizeFloat($position['y'] ?? 0.0),
        ];

        $size = isset($entry['size']) && is_array($entry['size']) ? $entry['size'] : [];
        $normalizedEntry['size'] = [
            'width' => tokenRepositorySanitizePositiveInt($size['width'] ?? 1),
            'height' => tokenRepositorySanitizePositiveInt($size['height'] ?? 1),
        ];

        if (isset($entry['stamina']) && is_numeric($entry['stamina'])) {
            $normalizedEntry['stamina'] = max(0, (int) round((float) $entry['stamina']));
        }

        $normalized[] = $normalizedEntry;
    }

    return array_values($normalized);
}

function normalizeTokenLibraryEntries(array $entries): array
{
    $normalized = [];

    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $id = isset($entry['id']) ? trim((string) $entry['id']) : '';
        if ($id === '') {
            continue;
        }

        $normalizedEntry = $entry;

        $imageData = isset($entry['imageData']) && is_string($entry['imageData'])
            ? trim($entry['imageData'])
            : '';
        if ($imageData !== '') {
            if (!tokenRepositoryIsValidImageData($imageData)) {
                continue;
            }
            $normalizedEntry['imageData'] = $imageData;
        }

        $normalized[] = $normalizedEntry;
    }

    return array_values($normalized);
}

function summarizeSceneTokensForChangeLog(array $entries): array
{
    $summary = [];

    foreach (normalizeSceneTokenEntries($entries) as $entry) {
        $hasImage = isset($entry['imageData']) && is_string($entry['imageData']) && $entry['imageData'] !== '';
        $imageHash = $hasImage ? tokenRepositoryComputeImageHash($entry['imageData']) : '';

        $item = $entry;
        unset($item['imageData']);
        $item['hasImage'] = $hasImage;
        $item['imageHash'] = $imageHash;

        $summary[] = $item;
    }

    return $summary;
}

function summarizeTokenLibraryForChangeLog(array $entries): array
{
    $summary = [];

    foreach (normalizeTokenLibraryEntries($entries) as $entry) {
        $hasImage = isset($entry['imageData']) && is_string($entry['imageData']) && $entry['imageData'] !== '';
        $imageHash = $hasImage ? tokenRepositoryComputeImageHash($entry['imageData']) : '';

        $item = $entry;
        unset($item['imageData']);
        $item['hasImage'] = $hasImage;
        $item['imageHash'] = $imageHash;

        $summary[] = $item;
    }

    return $summary;
}

function tokenRepositoryIsValidImageData(string $imageData): bool
{
    if (!preg_match('/^data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+\/=]+$/', $imageData)) {
        return false;
    }

    $parts = explode(',', $imageData, 2);
    if (count($parts) !== 2) {
        return false;
    }

    $decoded = base64_decode($parts[1], true);
    return $decoded !== false;
}

function tokenRepositorySanitizeFloat($value): float
{
    if (!is_numeric($value)) {
        return 0.0;
    }

    $float = (float) $value;
    if (!is_finite($float)) {
        return 0.0;
    }

    return $float;
}

function tokenRepositorySanitizePositiveInt($value): int
{
    if (!is_numeric($value)) {
        return 1;
    }

    $int = (int) round((float) $value);
    return max(1, $int);
}

function tokenRepositoryComputeImageHash(string $imageData): string
{
    return substr(hash('sha256', $imageData), 0, 16);
}
