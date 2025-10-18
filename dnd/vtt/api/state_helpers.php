<?php

declare(strict_types=1);

/**
 * @param array<int,array<string,mixed>> $existingEntries
 * @param array<int,array<string,mixed>> $incomingEntries
 * @return array<int,array<string,mixed>>
 */
function mergeSceneEntriesPreservingGmAuthored(array $existingEntries, array $incomingEntries): array
{
    $normalizedExisting = [];
    foreach ($existingEntries as $entry) {
        if (is_array($entry)) {
            $normalizedExisting[] = $entry;
        }
    }

    $incomingById = [];
    $incomingWithoutId = [];
    foreach ($incomingEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        if (isGmAuthoredBoardEntry($entry)) {
            // Never allow player payloads to replace GM-authored data.
            continue;
        }

        $identifier = extractBoardEntryIdentifier($entry);
        if ($identifier === null) {
            $incomingWithoutId[] = $entry;
            continue;
        }

        $incomingById[$identifier] = $entry;
    }

    $merged = [];
    foreach ($normalizedExisting as $entry) {
        $identifier = extractBoardEntryIdentifier($entry);

        if (isGmAuthoredBoardEntry($entry)) {
            $merged[] = $entry;
            if ($identifier !== null) {
                unset($incomingById[$identifier]);
            }
            continue;
        }

        if ($identifier !== null && array_key_exists($identifier, $incomingById)) {
            $merged[] = $incomingById[$identifier];
            unset($incomingById[$identifier]);
            continue;
        }

        if ($identifier === null) {
            // Without a stable identifier we cannot determine whether an entry was removed.
            $merged[] = $entry;
            continue;
        }

        // Non-GM entry omitted from the incoming payload should be removed.
    }

    foreach ($incomingById as $entry) {
        $merged[] = $entry;
    }

    foreach ($incomingWithoutId as $entry) {
        $merged[] = $entry;
    }

    return array_values($merged);
}

/**
 * @param array<string,mixed>|mixed $entry
 */
function isGmAuthoredBoardEntry($entry): bool
{
    if (!is_array($entry)) {
        return false;
    }

    return entryContainsGmMarker($entry, 0);
}

/**
 * @param array<string,mixed> $entry
 */
function entryContainsGmMarker(array $entry, int $depth): bool
{
    if ($depth > 3) {
        return false;
    }

    $booleanKeys = ['authorIsGm', 'gm', 'isGm', 'gmOnly', 'gm_only', 'gmAuthored', 'gm_authored'];
    foreach ($booleanKeys as $key) {
        if (array_key_exists($key, $entry) && interpretTruthyFlag($entry[$key])) {
            return true;
        }
    }

    $stringKeys = ['authorRole', 'role', 'createdByRole', 'source', 'ownerRole'];
    foreach ($stringKeys as $key) {
        if (!array_key_exists($key, $entry)) {
            continue;
        }
        $value = $entry[$key];
        if (is_string($value) && strtolower(trim($value)) === 'gm') {
            return true;
        }
    }

    $nestedKeys = ['metadata', 'meta', 'flags'];
    foreach ($nestedKeys as $nestedKey) {
        if (isset($entry[$nestedKey]) && is_array($entry[$nestedKey]) && entryContainsGmMarker($entry[$nestedKey], $depth + 1)) {
            return true;
        }
    }

    return false;
}

/**
 * @param mixed $value
 */
function interpretTruthyFlag($value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value) || is_float($value)) {
        return (bool) $value;
    }

    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === '') {
            return false;
        }
        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    }

    return false;
}

/**
 * @param array<string,mixed> $entry
 */
function extractBoardEntryIdentifier(array $entry): ?string
{
    $keys = ['id', 'uuid', 'uid', 'key', 'tokenId', 'token_id', 'templateId', 'template_id'];

    foreach ($keys as $key) {
        if (!array_key_exists($key, $entry)) {
            continue;
        }

        $raw = $entry[$key];
        if (is_string($raw)) {
            $candidate = trim($raw);
        } elseif (is_int($raw) || is_float($raw)) {
            $candidate = (string) $raw;
        } else {
            continue;
        }

        if ($candidate !== '') {
            return $candidate;
        }
    }

    return null;
}
