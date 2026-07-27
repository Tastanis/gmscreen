(function (global) {
    'use strict';

    const ATTRIBUTE_KEYS = ['might', 'agility', 'reason', 'intuition', 'presence'];
    const CONTAINER_KEYS = ['attributes', 'characteristics', 'stats'];

    function findKeyCaseInsensitive(object, wantedKey) {
        if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
        const exact = object[wantedKey];
        if (exact !== undefined) return exact;
        const actualKey = Object.keys(object).find(
            key => String(key).trim().toLowerCase() === wantedKey.toLowerCase()
        );
        return actualKey === undefined ? undefined : object[actualKey];
    }

    function findAttributeInArray(entries, wantedKey) {
        if (!Array.isArray(entries)) return undefined;
        const match = entries.find(entry => {
            if (!entry || typeof entry !== 'object') return false;
            const label = entry.name ?? entry.key ?? entry.attribute ?? entry.characteristic;
            return String(label || '').trim().toLowerCase() === wantedKey;
        });
        return match ? (match.value ?? match.score ?? match.modifier ?? match.amount) : undefined;
    }

    function readAttribute(source, wantedKey) {
        // The documented nested object is authoritative. Some exporters also
        // emit legacy top-level fields initialized to 0; reading those first
        // masked the real non-zero values in `attributes`.
        for (const containerKey of CONTAINER_KEYS) {
            const container = findKeyCaseInsensitive(source, containerKey);
            const nested = Array.isArray(container)
                ? findAttributeInArray(container, wantedKey)
                : findKeyCaseInsensitive(container, wantedKey);
            if (nested !== undefined) return nested;
        }
        return findKeyCaseInsensitive(source, wantedKey);
    }

    function normalizeAttributes(source, fallback = 0) {
        const result = {};
        ATTRIBUTE_KEYS.forEach(key => {
            const raw = readAttribute(source, key);
            const parsed = Number.parseInt(raw, 10);
            result[key] = Number.isFinite(parsed) ? parsed : fallback;
        });
        return result;
    }

    global.MonsterJsonImportNormalize = Object.freeze({
        ATTRIBUTE_KEYS,
        normalizeAttributes,
        readAttribute,
    });
})(typeof window !== 'undefined' ? window : globalThis);
