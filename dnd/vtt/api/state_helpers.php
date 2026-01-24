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
    $gmEntryIdentifiers = [];
    foreach ($existingEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $normalizedExisting[] = $entry;

        if (!isGmAuthoredBoardEntry($entry)) {
            continue;
        }

        $identifier = extractBoardEntryIdentifier($entry);
        if ($identifier !== null) {
            $gmEntryIdentifiers[$identifier] = true;
        }
    }

    $incomingById = [];
    $incomingWithoutId = [];
    foreach ($incomingEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $identifier = extractBoardEntryIdentifier($entry);

        if (isGmAuthoredBoardEntry($entry)) {
            if ($identifier === null) {
                // Brand-new GM-authored entries from players are ignored.
                continue;
            }

            if (!array_key_exists($identifier, $gmEntryIdentifiers)) {
                // Players cannot create new GM-authored entries even if an id is supplied.
                continue;
            }
        }

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
            if ($identifier !== null && array_key_exists($identifier, $incomingById)) {
                $merged[] = mergeGmAuthoredEntry($entry, $incomingById[$identifier]);
                unset($incomingById[$identifier]);
            } else {
                $merged[] = $entry;
                if ($identifier !== null) {
                    unset($incomingById[$identifier]);
                }
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
 * @param array<string,mixed> $existingEntry
 * @param array<string,mixed> $incomingEntry
 * @return array<string,mixed>
 */
function mergeGmAuthoredEntry(array $existingEntry, array $incomingEntry): array
{
    $merged = array_replace_recursive($existingEntry, $incomingEntry);

    return restoreGmMarkers($existingEntry, $merged, 0);
}

/**
 * @param array<string,mixed> $gmSource
 * @param array<string,mixed> $merged
 * @return array<string,mixed>
 */
function restoreGmMarkers(array $gmSource, array $merged, int $depth): array
{
    if ($depth > 5) {
        return $merged;
    }

    $booleanKeys = ['authorIsGm', 'gm', 'isGm', 'gmOnly', 'gm_only', 'gmAuthored', 'gm_authored', 'hidden'];
    foreach ($booleanKeys as $key) {
        if (array_key_exists($key, $gmSource)) {
            $merged[$key] = $gmSource[$key];
        }
    }

    $stringKeys = ['authorRole', 'role', 'createdByRole', 'source', 'ownerRole'];
    foreach ($stringKeys as $key) {
        if (array_key_exists($key, $gmSource)) {
            $merged[$key] = $gmSource[$key];
        }
    }

    $nestedKeys = ['metadata', 'meta', 'flags'];
    foreach ($nestedKeys as $nestedKey) {
        if (!isset($gmSource[$nestedKey]) || !is_array($gmSource[$nestedKey])) {
            continue;
        }

        $target = isset($merged[$nestedKey]) && is_array($merged[$nestedKey])
            ? $merged[$nestedKey]
            : [];

        $target = array_replace_recursive($gmSource[$nestedKey], $target);
        $merged[$nestedKey] = restoreGmMarkers($gmSource[$nestedKey], $target, $depth + 1);
    }

    return $merged;
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

/**
 * Merge scene entries using timestamp-based conflict resolution (delta merge).
 * Incoming entries are merged by ID - if an entry exists, the one with newer _lastModified wins.
 * Existing entries not in the incoming set are preserved (this is a delta, not a replacement).
 *
 * @param array<int,array<string,mixed>> $existingEntries
 * @param array<int,array<string,mixed>> $incomingEntries
 * @return array<int,array<string,mixed>>
 */
function mergeSceneEntriesByTimestamp(array $existingEntries, array $incomingEntries): array
{
    // Index existing entries by ID
    $existingById = [];
    $existingWithoutId = [];
    foreach ($existingEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $id = extractBoardEntryIdentifier($entry);
        if ($id !== null) {
            $existingById[$id] = $entry;
        } else {
            $existingWithoutId[] = $entry;
        }
    }

    // Process incoming entries - merge by ID using timestamps
    foreach ($incomingEntries as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $id = extractBoardEntryIdentifier($entry);
        if ($id === null) {
            // Entry without ID - add if new
            $existingWithoutId[] = $entry;
            continue;
        }

        // Check if entry exists and compare timestamps
        if (array_key_exists($id, $existingById)) {
            $existingEntry = $existingById[$id];
            $existingTimestamp = extractEntryTimestamp($existingEntry);
            $incomingTimestamp = extractEntryTimestamp($entry);

            // Keep the entry with newer timestamp (or incoming if equal/no timestamp)
            if ($incomingTimestamp >= $existingTimestamp) {
                // Preserve GM markers if the existing entry was GM-authored
                if (isGmAuthoredBoardEntry($existingEntry)) {
                    $existingById[$id] = mergeGmAuthoredEntry($existingEntry, $entry);
                } else {
                    $existingById[$id] = $entry;
                }
            }
            // else: keep existing entry (it's newer)
        } else {
            // New entry - add it
            $existingById[$id] = $entry;
        }
    }

    // Combine results
    $merged = array_values($existingById);
    foreach ($existingWithoutId as $entry) {
        $merged[] = $entry;
    }

    return $merged;
}

/**
 * Extract timestamp from an entry for conflict resolution.
 * Looks for _lastModified, lastModified, updatedAt, or timestamp fields.
 *
 * @param array<string,mixed> $entry
 * @return int Timestamp in milliseconds, or 0 if not found
 */
function extractEntryTimestamp(array $entry): int
{
    $timestampKeys = ['_lastModified', 'lastModified', 'updatedAt', 'timestamp', 'modifiedAt'];

    foreach ($timestampKeys as $key) {
        if (!array_key_exists($key, $entry)) {
            continue;
        }
        $value = $entry[$key];
        if (is_numeric($value)) {
            return (int) $value;
        }
    }

    return 0;
}
