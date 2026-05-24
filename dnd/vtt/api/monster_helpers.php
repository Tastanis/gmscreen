<?php
declare(strict_types=1);

const VTT_MONSTER_DATA_PATH = __DIR__ . '/../../strixhaven/monster-creator/data/gm-monsters.json';

function vttArrayIsList(array $value): bool
{
    if (function_exists('array_is_list')) {
        return array_is_list($value);
    }

    $expectedKey = 0;
    foreach ($value as $key => $_) {
        if ($key !== $expectedKey) {
            return false;
        }
        $expectedKey++;
    }

    return true;
}

/**
 * Loads and normalizes the monster catalog used by the GM monster creator.
 *
 * @return array<string,array<string,mixed>>
 */
function loadMonsterCatalog(): array
{
    static $catalog = null;

    if ($catalog !== null) {
        return $catalog;
    }

    $catalog = [];
    $path = VTT_MONSTER_DATA_PATH;

    if (!is_readable($path)) {
        return $catalog;
    }

    $contents = file_get_contents($path);
    if ($contents === false || $contents === '') {
        return $catalog;
    }

    $data = json_decode($contents, true);
    if (!is_array($data)) {
        return $catalog;
    }

    $rawMonsters = [];
    if (isset($data['monsters']) && is_array($data['monsters'])) {
        $rawMonsters = $data['monsters'];
    } elseif (vttArrayIsList($data)) {
        $rawMonsters = $data;
    }

    foreach ($rawMonsters as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $normalized = normalizeMonsterSnapshot($entry, is_string($key) ? $key : null);
        if ($normalized === null) {
            continue;
        }

        $catalog[$normalized['id']] = $normalized;
    }

    return $catalog;
}

/**
 * Provides a list of monster summaries for fast lookups.
 *
 * @return array<int,array<string,mixed>>
 */
function getMonsterSummaries(): array
{
    $catalog = loadMonsterCatalog();
    $summaries = [];

    foreach ($catalog as $monster) {
        $summaries[] = array_filter(
            [
                'id' => $monster['id'],
                'name' => $monster['name'],
                'role' => $monster['role'] ?? null,
                'level' => $monster['level'] ?? null,
                'stamina' => $monster['stamina'] ?? null,
                'updatedAt' => $monster['updatedAt'] ?? null,
                'imageUrl' => $monster['imageUrl'] ?? null,
            ],
            static fn ($value) => $value !== null && $value !== ''
        );
    }

    return $summaries;
}

/**
 * @return array<string,mixed>|null
 */
function findMonsterById(string $monsterId): ?array
{
    $monsterId = sanitizeMonsterId($monsterId);
    if ($monsterId === null) {
        return null;
    }

    $catalog = loadMonsterCatalog();
    return $catalog[$monsterId] ?? null;
}

/**
 * @param array<string,mixed>|mixed $monster
 * @return array<string,mixed>|null
 */
function normalizeMonsterSnapshot($monster, ?string $fallbackId = null): ?array
{
    if (!is_array($monster)) {
        return null;
    }

    $id = sanitizeMonsterId($monster['id'] ?? $fallbackId ?? null);
    $name = sanitizeMonsterString($monster['name'] ?? '');

    if ($id === null || $name === '') {
        return null;
    }

    $role = sanitizeMonsterString($monster['role'] ?? ($monster['types'] ?? ''));
    $level = sanitizeMonsterInt($monster['level'] ?? null, 0, 200, true);
    $size = sanitizeMonsterSize($monster['size'] ?? null);
    $footprint = deriveMonsterGridFootprint($size);
    $stamina = sanitizeMonsterInt($monster['stamina'] ?? ($monster['hp'] ?? null), 0, 100000, true);
    $movement = sanitizeMonsterString($monster['movement'] ?? ($monster['speed'] ?? ''));
    $defenses = buildMonsterDefenses($monster);
    $attributes = buildMonsterAttributes($monster);
    $imageUrl = sanitizeMonsterImage($monster['imageUrl'] ?? ($monster['image'] ?? ''));
    $updatedAt = sanitizeMonsterDate($monster['updatedAt'] ?? ($monster['updated_at'] ?? ($monster['updated'] ?? null)));
    $ev = sanitizeMonsterInt($monster['ev'] ?? null, -1000, 1000, true);
    $speed = sanitizeMonsterInt($monster['speed'] ?? null, 0, 1000, true);
    $stability = sanitizeMonsterInt($monster['stability'] ?? null, -1000, 1000, true);
    $freeStrike = sanitizeMonsterInt($monster['free_strike'] ?? null, -1000, 1000, true);
    $types = sanitizeMonsterString($monster['types'] ?? '');

    $abilities = normalizeMonsterAbilities($monster['abilities'] ?? []);

    $result = [
        'id' => $id,
        'name' => $name,
        'role' => $role !== '' ? $role : null,
        'level' => $level,
        'size' => $size,
        'footprint' => $footprint,
        'stamina' => $stamina,
        'hp' => $stamina,
        'movement' => $movement !== '' ? $movement : null,
        'defenses' => $defenses,
        'attributes' => $attributes,
        'imageUrl' => $imageUrl,
        'abilities' => $abilities,
    ];

    if ($updatedAt !== null) {
        $result['updatedAt'] = $updatedAt;
    }
    if ($ev !== null) {
        $result['ev'] = $ev;
    }
    if ($speed !== null) {
        $result['speed'] = $speed;
    }
    if ($stability !== null) {
        $result['stability'] = $stability;
    }
    if ($freeStrike !== null) {
        $result['free_strike'] = $freeStrike;
    }
    if ($types !== '') {
        $result['types'] = $types;
    }

    return removeNullMonsterFields($result);
}

/**
 * @param mixed $value
 */
function sanitizeMonsterId($value): ?string
{
    if (is_string($value) || is_numeric($value)) {
        $id = trim((string) $value);
        return $id === '' ? null : $id;
    }

    return null;
}

/**
 * @param mixed $value
 */
function sanitizeMonsterString($value): string
{
    if (is_string($value) || is_numeric($value)) {
        return trim((string) $value);
    }

    return '';
}

/**
 * @param mixed $value
 */
function sanitizeMonsterInt($value, int $min, int $max, bool $allowNull = false): ?int
{
    if ($value === null || $value === '') {
        return $allowNull ? null : 0;
    }

    $filtered = filter_var($value, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => $min, 'max_range' => $max],
    ]);

    if ($filtered === false) {
        return $allowNull ? null : 0;
    }

    return (int) $filtered;
}

function sanitizeMonsterSize($value): string
{
    if (!is_string($value) && !is_numeric($value)) {
        return '1M';
    }

    $size = strtoupper(trim((string) $value));
    if ($size === '') {
        return '1M';
    }

    return $size;
}

function deriveMonsterGridFootprint(string $size): string
{
    if (preg_match('/^[1-9][0-9]*$/', $size)) {
        return $size . 'x' . $size;
    }

    if (preg_match('/^(\d+)/', $size, $matches)) {
        $value = (int) $matches[1];
        $value = max(1, min(12, $value));
        return $value . 'x' . $value;
    }

    return '1x1';
}

/**
 * @param mixed $value
 */
function sanitizeMonsterImage($value): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    $image = trim($value);
    if (preg_match('/^https?:\/\//i', $image)) {
        return $image;
    }

    if ($image[0] === '/') {
        return $image;
    }

    return '/dnd/strixhaven/monster-creator/images/' . ltrim($image, '/');
}

/**
 * @param mixed $value
 */
function sanitizeMonsterDate($value): ?string
{
    if (!is_string($value) && !is_numeric($value)) {
        return null;
    }

    $timestamp = strtotime((string) $value);
    if ($timestamp === false) {
        return null;
    }

    return date(DATE_ATOM, $timestamp);
}

/**
 * @param array<string,mixed> $monster
 * @return array<string,mixed>
 */
function buildMonsterDefenses(array $monster): array
{
    $defenses = [];

    $immunitySource = [];
    if (isset($monster['immunity']) && is_array($monster['immunity'])) {
        $immunitySource = $monster['immunity'];
    }

    $immunityType = sanitizeMonsterString($immunitySource['type'] ?? $monster['immunity_type'] ?? '');
    $immunityValue = sanitizeMonsterString($immunitySource['value'] ?? $monster['immunity_value'] ?? '');
    if ($immunityType !== '' || $immunityValue !== '') {
        $entry = [];
        if ($immunityType !== '') {
            $entry['type'] = $immunityType;
        }
        if ($immunityValue !== '') {
            $entry['value'] = $immunityValue;
        }
        $defenses['immunity'] = $entry;
    }

    $weaknessSource = [];
    if (isset($monster['weakness']) && is_array($monster['weakness'])) {
        $weaknessSource = $monster['weakness'];
    }

    $weaknessType = sanitizeMonsterString($weaknessSource['type'] ?? $monster['weakness_type'] ?? '');
    $weaknessValue = sanitizeMonsterString($weaknessSource['value'] ?? $monster['weakness_value'] ?? '');
    if ($weaknessType !== '' || $weaknessValue !== '') {
        $entry = [];
        if ($weaknessType !== '') {
            $entry['type'] = $weaknessType;
        }
        if ($weaknessValue !== '') {
            $entry['value'] = $weaknessValue;
        }
        $defenses['weakness'] = $entry;
    }

    $stability = sanitizeMonsterInt($monster['stability'] ?? ($monster['stability_value'] ?? null), -1000, 1000, true);
    if ($stability !== null) {
        $defenses['stability'] = $stability;
    }

    $freeStrike = sanitizeMonsterInt($monster['free_strike'] ?? ($monster['freeStrike'] ?? null), -1000, 1000, true);
    if ($freeStrike !== null) {
        $defenses['free_strike'] = $freeStrike;
    }

    return $defenses;
}

/**
 * @param array<string,mixed> $monster
 * @return array<string,int>
 */
function buildMonsterAttributes(array $monster): array
{
    $attributes = [];
    $keys = ['might', 'agility', 'reason', 'intuition', 'presence'];

    foreach ($keys as $key) {
        $value = sanitizeMonsterInt($monster[$key] ?? null, -1000, 1000, true);
        if ($value !== null) {
            $attributes[$key] = $value;
        }
    }

    return $attributes;
}

/**
 * @param mixed $rawAbilities
 * @return array<string,array<int,array<string,mixed>>>
 */
function normalizeMonsterAbilities($rawAbilities): array
{
    if (!is_array($rawAbilities)) {
        return [];
    }

    $categories = [
        'passive',
        'maneuver',
        'action',
        'triggered_action',
        'villain_action',
        'malice',
    ];

    $normalized = [];

    foreach ($categories as $category) {
        if (!isset($rawAbilities[$category]) || !is_array($rawAbilities[$category])) {
            continue;
        }

        $normalizedAbilities = [];
        foreach ($rawAbilities[$category] as $ability) {
            $normalizedAbility = normalizeMonsterAbility($ability, $category);
            if ($normalizedAbility !== null) {
                $normalizedAbilities[] = $normalizedAbility;
            }
        }

        if ($normalizedAbilities !== []) {
            $normalized[$category] = $normalizedAbilities;
        }
    }

    return $normalized;
}

/**
 * @param mixed $ability
 * @return array<string,mixed>|null
 */
function normalizeMonsterAbility($ability, string $category): ?array
{
    if (!is_array($ability)) {
        return null;
    }

    $name = sanitizeMonsterString($ability['name'] ?? '');
    if ($name === '') {
        return null;
    }

    $keywords = sanitizeMonsterString($ability['keywords'] ?? '');
    $range = sanitizeMonsterString($ability['range'] ?? '');
    $targets = sanitizeMonsterString($ability['targets'] ?? '');
    $resourceCost = sanitizeMonsterString($ability['resource_cost'] ?? ($ability['cost'] ?? ''));
    $trigger = sanitizeMonsterString($ability['trigger'] ?? '');
    $effect = sanitizeMonsterString($ability['effect'] ?? '');
    $additional = sanitizeMonsterString($ability['additional_effect'] ?? '');
    $hasTest = filter_var($ability['has_test'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $test = normalizeMonsterAbilityTest($ability['test'] ?? []);

    if ($hasTest === false && $test === []) {
        $hasTest = false;
        $test = [];
    } elseif ($hasTest === true && $test === []) {
        $hasTest = false;
    }

    $normalized = ['name' => $name];
    if ($keywords !== '') {
        $normalized['keywords'] = $keywords;
    }
    if ($range !== '') {
        $normalized['range'] = $range;
    }
    if ($targets !== '') {
        $normalized['targets'] = $targets;
    }
    if ($resourceCost !== '' && ($category === 'villain_action' || $category === 'malice')) {
        $normalized['resource_cost'] = $resourceCost;
    }
    if ($effect !== '') {
        $normalized['effect'] = $effect;
    }
    if ($additional !== '') {
        $normalized['additional_effect'] = $additional;
    }
    if ($category === 'triggered_action' && $trigger !== '') {
        $normalized['trigger'] = $trigger;
    }
    if ($hasTest && $test !== []) {
        $normalized['has_test'] = true;
        $normalized['test'] = $test;
    }

    return $normalized;
}

/**
 * @param mixed $raw
 * @return array<string,array<string,mixed>>
 */
function normalizeMonsterAbilityTest($raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $tiers = ['tier1', 'tier2', 'tier3'];
    $normalized = [];

    foreach ($tiers as $tier) {
        if (!isset($raw[$tier]) || !is_array($raw[$tier])) {
            continue;
        }

        $tierData = $raw[$tier];
        $damageAmount = sanitizeMonsterString($tierData['damage_amount'] ?? '');
        $damageType = sanitizeMonsterString($tierData['damage_type'] ?? '');
        $hasAttributeCheck = filter_var($tierData['has_attribute_check'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $attribute = sanitizeMonsterString($tierData['attribute'] ?? '');
        $threshold = sanitizeMonsterInt($tierData['attribute_threshold'] ?? null, -1000, 1000, true);
        $attributeEffect = sanitizeMonsterString($tierData['attribute_effect'] ?? '');

        if ($damageAmount === '' && $damageType === '' && $hasAttributeCheck === false && $attribute === '' && $attributeEffect === '' && $threshold === null) {
            continue;
        }

        $entry = [];
        if ($damageAmount !== '') {
            $entry['damage_amount'] = $damageAmount;
        }
        if ($damageType !== '') {
            $entry['damage_type'] = $damageType;
        }
        if ($hasAttributeCheck) {
            $entry['has_attribute_check'] = true;
        }
        if ($attribute !== '') {
            $entry['attribute'] = $attribute;
        }
        if ($threshold !== null) {
            $entry['attribute_threshold'] = $threshold;
        }
        if ($attributeEffect !== '') {
            $entry['attribute_effect'] = $attributeEffect;
        }

        if ($entry !== []) {
            $normalized[$tier] = $entry;
        }
    }

    return $normalized;
}

/**
 * Removes null values while preserving zeroes and empty arrays.
 *
 * @param array<string,mixed> $monster
 * @return array<string,mixed>
 */
function removeNullMonsterFields(array $monster): array
{
    foreach ($monster as $key => $value) {
        if ($value === null) {
            unset($monster[$key]);
            continue;
        }

        if (is_array($value)) {
            $monster[$key] = removeNullMonsterFields($value);
            if ($monster[$key] === []) {
                unset($monster[$key]);
            }
        }
    }

    return $monster;
}

/**
 * @param mixed $value
 */
function sanitizeMonsterTokenType($value): ?string
{
    if (!is_string($value) && !is_numeric($value)) {
        return null;
    }

    $type = strtolower(trim((string) $value));
    if ($type === '') {
        return null;
    }

    if (!preg_match('/^[a-z0-9_-]{1,32}$/', $type)) {
        return null;
    }

    return $type;
}

/**
 * @param mixed $value
 */
function sanitizeMonsterReferenceId($value): ?string
{
    return sanitizeMonsterId($value);
}

/**
 * @param mixed $value
 * @return array<string,mixed>|null
 */
function sanitizeMonsterSnapshot($value): ?array
{
    if (!is_array($value)) {
        return null;
    }

    return normalizeMonsterSnapshot($value, $value['id'] ?? null);
}
