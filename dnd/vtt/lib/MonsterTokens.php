<?php
declare(strict_types=1);

/**
 * Every monster in the Monster Creator is a token in the token library (Brandon, October 27, 2026): made or uploaded
 * there, it is in the library at once, in a folder named after its tab (and sub-tab), with its picture, size, stamina
 * and the enemy side. These tokens are not written into tokens.json: they are made from the monsters each time the
 * library is read, so a renamed, re-pictured or deleted monster is followed at once.
 *
 * What the Director changes on such a token (size, ally or enemy, max stamina, its picture) is kept per monster in
 * tokens.json under "monsterTokens" and wins over the monster's own values.
 *
 * Token ids: "mon_" + the monster's id.
 */
require_once __DIR__ . '/../api/monster_helpers.php';

final class MonsterTokens
{
    public const PREFIX = 'mon_';
    public const FOLDER_PREFIX = 'mtf_';

    public static function isMonsterToken(string $tokenId): bool
    {
        return strncmp($tokenId, self::PREFIX, strlen(self::PREFIX)) === 0;
    }

    public static function monsterIdOf(string $tokenId): string
    {
        return self::isMonsterToken($tokenId) ? substr($tokenId, strlen(self::PREFIX)) : '';
    }

    /**
     * The library with the monsters' tokens added after the Director's own folders and tokens.
     *
     * @param array{folders?:array,items?:array} $payload
     * @param array<string,array<string,mixed>> $overrides monster id => the Director's changes
     * @param array<string,array<string,mixed>>|null $catalog the monsters (loadMonsterCatalog() when null)
     */
    public static function merge(array $payload, array $overrides, ?array $catalog = null): array
    {
        try {
            $catalog = $catalog ?? loadMonsterCatalog();
        } catch (Throwable $error) {
            error_log('[VTT] Monster tokens skipped: ' . $error->getMessage());
            return $payload;
        }
        $folders = [];
        $items = [];
        foreach ($catalog as $monster) {
            $token = self::tokenFor($monster, $overrides[(string) ($monster['id'] ?? '')] ?? []);
            if ($token === null) {
                continue;
            }
            $folders[$token['folderId']] ??= ['id' => $token['folderId'], 'name' => $token['folderName'], 'source' => 'monster-creator'];
            unset($token['folderName']);
            $items[] = $token;
        }
        usort($items, static fn ($a, $b) => strcasecmp((string) $a['name'], (string) $b['name']));
        $folderList = array_values($folders);
        usort($folderList, static fn ($a, $b) => strcasecmp((string) $a['name'], (string) $b['name']));
        return [
            'folders' => array_merge(array_values($payload['folders'] ?? []), $folderList),
            'items' => array_merge(array_values($payload['items'] ?? []), $items),
        ];
    }

    /** One monster's token, or null for a monster without an id. */
    public static function tokenFor(array $monster, array $override = []): ?array
    {
        $id = trim((string) ($monster['id'] ?? ''));
        if ($id === '') {
            return null;
        }
        $parts = array_values(array_filter(array_map('strval', (array) ($monster['sourceFolderParts'] ?? [])), static fn ($p) => trim($p) !== ''));
        $label = $parts ? implode(' / ', $parts) : 'Other monsters';
        $folderName = 'Monster Creator · ' . $label;
        $name = trim((string) ($monster['name'] ?? '')) ?: 'Monster';
        $picture = is_string($monster['imageUrl'] ?? null) && $monster['imageUrl'] !== '' ? $monster['imageUrl'] : self::placeholder($name);
        $footprint = is_string($monster['footprint'] ?? null) && preg_match('/^\d+x\d+$/', $monster['footprint']) ? $monster['footprint'] : deriveMonsterGridFootprint((string) ($monster['size'] ?? '1'));
        $stamina = is_numeric($monster['stamina'] ?? null) && (int) $monster['stamina'] > 0 ? (int) $monster['stamina'] : null;   // none set: blank, not 0
        $team = in_array($override['team'] ?? null, ['ally', 'enemy'], true) ? $override['team'] : 'enemy';
        $token = [
            'id' => self::PREFIX . $id,
            'name' => $name,
            'folderId' => self::FOLDER_PREFIX . substr(sha1($label), 0, 12),
            'folderName' => $folderName,
            'imageUrl' => is_string($override['imageUrl'] ?? null) && $override['imageUrl'] !== '' ? $override['imageUrl'] : $picture,
            'sourceImageUrl' => $picture,
            'size' => is_string($override['size'] ?? null) && $override['size'] !== '' ? $override['size'] : $footprint,
            'combatTeam' => $team,
            'team' => $team,
            'type' => 'monster',
            'monsterId' => $id,
            'source' => 'monster-creator',
        ];
        $hp = array_key_exists('hp', $override) && is_numeric($override['hp']) ? (int) $override['hp'] : $stamina;
        if ($hp !== null) {
            $token['hp'] = $hp;
        }
        return $token;
    }

    /** A plain round picture with the monster's initials, for a monster with no picture yet. */
    public static function placeholder(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];
        $initials = strtoupper(implode('', array_map(static fn ($w) => preg_match('/^./u', $w, $m) ? $m[0] : '', array_slice($words, 0, 2)))) ?: '?';
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="62" fill="#3a2418" stroke="#8a6d36" stroke-width="4"/>'
            . '<text x="64" y="80" font-family="Georgia,serif" font-size="48" font-weight="700" fill="#f0d898" text-anchor="middle">' . htmlspecialchars($initials, ENT_QUOTES | ENT_XML1) . '</text></svg>';
        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
