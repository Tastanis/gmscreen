(function (global) {
    'use strict';

    // Shared by the Monster Creator page (paste import and the "Upload monsters" flow) and by
    // dnd/tools/site-upload.mjs. One copy of each reading rule: change it here, not in a caller.

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

    // ---- required stats ------------------------------------------------------------------------
    // The template's non-negotiable stats, with every spelling normalizeImportedMonsterJson
    // (monster-builder.js) reads for them. The normaliser falls back to a default when a stat is
    // absent; this says which ones it had to make up, so the upload preview can refuse the monster.
    const REQUIRED_STATS = [
        { stat: 'name', paths: ['name'] },
        { stat: 'level', paths: ['level'], number: true },
        { stat: 'role', paths: ['role', 'organization', 'tactical_role', 'tacticalRole'] },
        { stat: 'types', paths: ['types', 'type'] },
        { stat: 'ev', paths: ['ev'], number: true },
        { stat: 'size', paths: ['size'] },
        { stat: 'speed', paths: ['speed'], number: true },
        { stat: 'stamina', paths: ['stamina', 'hp'], number: true },
        { stat: 'stability', paths: ['stability', 'defenses.stability'], number: true },
        { stat: 'free_strike', paths: ['free_strike', 'freeStrike', 'defenses.free_strike', 'defenses.freeStrike'], number: true },
    ];

    function readPath(source, path) {
        return path.split('.').reduce(
            (value, key) => (value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined),
            source
        );
    }

    function isGiven(value, number) {
        if (value === undefined || value === null) return false;
        if (typeof value === 'object') return false;
        const text = String(value).trim();
        if (text === '') return false;
        return number ? Number.isFinite(Number.parseInt(text, 10)) : true;
    }

    /** The required stats a monster object leaves out (or gives as something that is not a number). */
    function missingRequiredStats(source) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return REQUIRED_STATS.map(entry => entry.stat).concat(ATTRIBUTE_KEYS);
        }
        const missing = REQUIRED_STATS
            .filter(entry => !entry.paths.some(path => isGiven(readPath(source, path), entry.number)))
            .map(entry => entry.stat);
        ATTRIBUTE_KEYS.forEach(key => {
            if (!isGiven(readAttribute(source, key), true)) missing.push(key);
        });
        return missing;
    }

    // ---- file shapes ---------------------------------------------------------------------------
    // Accepted: one monster object; {"monster": {...}}; an array of monsters; or a package
    // {"monsters": [...], "tab": "...", "subTab": "..."}. Items of a list may themselves be
    // {"monster": {...}} wrappers. Returns the package's tab/sub-tab and one item per monster.
    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function textOf(value) {
        return value === undefined || value === null || typeof value === 'object' ? '' : String(value).trim();
    }

    function unwrapItem(item) {
        if (!isPlainObject(item)) return null;
        if (isPlainObject(item.monster)) {
            // A wrapper's id/tab/subTab/image still count when the monster itself does not say.
            const merged = { ...item.monster };
            ['id', 'monsterId', 'tab', 'subTab', 'subtab', 'imageUrl', 'image'].forEach(key => {
                if (merged[key] === undefined && item[key] !== undefined) merged[key] = item[key];
            });
            return merged;
        }
        return item;
    }

    function readImportFile(parsed) {
        const result = { package: { tab: '', subTab: '' }, items: [], error: '' };
        let list;
        if (Array.isArray(parsed)) {
            list = parsed;
        } else if (isPlainObject(parsed) && Array.isArray(parsed.monsters)) {
            list = parsed.monsters;
            result.package.tab = textOf(parsed.tab);
            result.package.subTab = textOf(parsed.subTab ?? parsed.subtab);
        } else if (isPlainObject(parsed)) {
            list = [parsed];
        } else {
            result.error = 'The file must hold a monster object, a list of monsters, or {"monsters": [...]}.';
            return result;
        }
        if (list.length === 0) {
            result.error = 'The file has no monsters in it.';
            return result;
        }
        result.items = list.map((item, index) => {
            const source = unwrapItem(item);
            return source
                ? { index, source }
                : { index, source: null, error: `Item ${index + 1} is not a monster object.` };
        });
        return result;
    }

    /** Every automation block's warnings in a normalised monster, named by the ability or trait. */
    function automationWarnings(monster) {
        const out = [];
        const collect = (owner, automation) => {
            if (!isPlainObject(automation) || !Array.isArray(automation.warnings)) return;
            automation.warnings.forEach(warning => out.push(`${owner} automation: ${warning}`));
        };
        Object.entries(isPlainObject(monster?.abilities) ? monster.abilities : {}).forEach(([category, list]) => {
            (Array.isArray(list) ? list : []).forEach(ability => collect(`${ability?.name || 'Unnamed'} (${category})`, ability?.automation));
        });
        (Array.isArray(monster?.traits) ? monster.traits : []).forEach(trait => collect(`${trait?.name || 'Unnamed'} (trait)`, trait?.automation));
        return out;
    }

    /**
     * Reads an upload file into what the server's preview and apply take: each monster's original
     * object (`source`, for its id/tab/image), the monster as the paste import would make it
     * (`monster`), the stats it left out, and its automation warnings. `normalizeMonster` is the
     * page's normalizeImportedMonsterJson.
     */
    function prepareUpload(parsed, normalizeMonster) {
        const file = readImportFile(parsed);
        const entries = file.items.map(item => {
            if (!item.source) {
                return { source: null, monster: null, missing: [], automationWarnings: [], normalizeError: item.error };
            }
            let monster = null;
            let normalizeError = '';
            try {
                monster = JSON.parse(JSON.stringify(normalizeMonster(item.source)));
            } catch (error) {
                normalizeError = error && error.message ? error.message : String(error);
            }
            return {
                source: item.source,
                monster,
                missing: missingRequiredStats(item.source),
                automationWarnings: monster ? automationWarnings(monster) : [],
                normalizeError,
            };
        });
        return { package: file.package, entries, error: file.error };
    }

    global.MonsterJsonImportNormalize = Object.freeze({
        ATTRIBUTE_KEYS,
        REQUIRED_STATS,
        normalizeAttributes,
        readAttribute,
        missingRequiredStats,
        readImportFile,
        automationWarnings,
        prepareUpload,
    });
})(typeof window !== 'undefined' ? window : globalThis);
