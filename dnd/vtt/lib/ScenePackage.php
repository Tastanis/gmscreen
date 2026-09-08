<?php
declare(strict_types=1);

/** Read-only scene package. No imports, asset fetches, or board writes. */
final class ScenePackage
{
    public static function preview(array $package): array
    {
        if (($package['format'] ?? null) !== 'gmscreen-scene/v1') throw new InvalidArgumentException('Unsupported scene package format.');
        try { $encoded = json_encode($package, JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new InvalidArgumentException('Scene package contains invalid numeric or text data.'); }
        if (strlen($encoded) > 16777216) throw new InvalidArgumentException('This scene exceeds the 16 MB package limit.');
        $scene = $package['scene'] ?? null; $domains = $package['domains'] ?? null;
        if (!is_array($scene) || !is_string($scene['id'] ?? null) || trim($scene['id']) === ''
            || !is_string($scene['name'] ?? null) || trim($scene['name']) === '' || strlen($scene['name']) > 640) throw new InvalidArgumentException('Scene ID and name are required.');
        if (!is_array($domains)) throw new InvalidArgumentException('Scene board domains are required.');
        foreach (['placements','sceneConfig','drawings','templates'] as $domain) if (!is_array($domains[$domain] ?? null)) throw new InvalidArgumentException('Missing scene domain: ' . $domain . '.');
        foreach (array_keys($domains) as $domain) if (!in_array($domain,['placements','sceneConfig','drawings','templates'],true)) throw new InvalidArgumentException('Unsupported scene domain: ' . $domain . '.');
        $mapLevels = $domains['sceneConfig']['mapLevels'] ?? [];
        if (!is_array($mapLevels) || !is_array($mapLevels['levels'] ?? []) || count($mapLevels['levels'] ?? []) > 5) throw new InvalidArgumentException('Invalid floor configuration (at most five added floors).');
        $levels = ['level-0'=>true];
        foreach ($mapLevels['levels'] ?? [] as $level) {
            if (!is_array($level) || !is_string($level['id'] ?? null) || trim($level['id']) === '' || isset($levels[$level['id']])) throw new InvalidArgumentException('Floors must have unique nonempty IDs.');
            $levels[$level['id']] = true;
        }
        foreach ([['stairs'=>$mapLevels['baseStairs'] ?? []], ...($mapLevels['levels'] ?? [])] as $level) {
            if (!is_array($level['stairs'] ?? [])) throw new InvalidArgumentException('Invalid stair list.');
            foreach ($level['stairs'] ?? [] as $stair) {
                if (!is_array($stair)) throw new InvalidArgumentException('Invalid stair record.');
                $target = $stair['linkedLevelId'] ?? null;
                if ($target !== null && (!is_string($target) || !isset($levels[$target]))) throw new InvalidArgumentException('A stair links to a missing floor.');
            }
        }
        $counts = [];
        foreach (['placements','drawings','templates'] as $domain) {
            if (count($domains[$domain]) > 5000) throw new InvalidArgumentException('Too many entries in ' . $domain . '.');
            $ids = [];
            foreach ($domains[$domain] as $key=>$entry) {
                if (!is_array($entry) || !is_string($entry['id'] ?? null) || trim($entry['id']) === '' || isset($ids[$entry['id']]) || (string) $key !== $entry['id']) throw new InvalidArgumentException('Invalid or mismatched entity ID in ' . $domain . '.');
                $ids[$entry['id']] = true;
                $levelId = $entry['levelId'] ?? 'level-0';
                if (!is_string($levelId) || !isset($levels[$levelId])) throw new InvalidArgumentException('An entry in ' . $domain . ' uses a missing floor.');
            }
            $counts[$domain] = count($domains[$domain]);
        }
        $fogState = $domains['sceneConfig']['fogOfWar'] ?? [];
        if (!is_array($fogState) || !is_array($fogState['byLevel'] ?? [])) throw new InvalidArgumentException('Invalid fog configuration.');
        foreach ($fogState['byLevel'] ?? [] as $levelId=>$fog) if (!isset($levels[$levelId]) || !is_array($fog)) throw new InvalidArgumentException('Fog references a missing floor or invalid data.');
        $clean = self::build($scene, ['revision'=>0,'state'=>array_map(static fn($entries)=>[$scene['id']=>$entries], $domains)], is_array($package['folder'] ?? null) ? $package['folder'] : null);
        foreach ($clean['assetReferences'] as $url) {
            if (preg_match('/[\x00-\x20]/', $url) || str_starts_with($url, '//') || (!str_starts_with($url, '/') && !preg_match('~^https?://~i',$url))) throw new InvalidArgumentException('Image references must use HTTP(S) or a site-relative path.');
        }
        return ['name'=>$scene['name'], 'counts'=>[...$counts,'floors'=>count($levels)], 'assetReferences'=>$clean['assetReferences'],
            'warnings'=>['Image files and character sheets are not bundled. Referenced images must remain accessible.', 'This preview does not install or change any scene.']];
    }

    public static function build(array $scene, array $snapshot, ?array $folder = null): array
    {
        $sceneId = $scene['id'] ?? null;
        if (!is_string($sceneId) || trim($sceneId) === '') throw new InvalidArgumentException('A stored scene is required.');
        $state = $snapshot['state'] ?? [];
        $domains = [];
        foreach (['placements','sceneConfig','drawings','templates'] as $domain) {
            $domains[$domain] = is_array($state[$domain][$sceneId] ?? null) ? $state[$domain][$sceneId] : [];
        }
        unset($domains['sceneConfig']['userLevelState'], $domains['sceneConfig']['pcTokenAssociations'], $domains['sceneConfig']['_revision']);
        foreach (['placements','drawings','templates'] as $domain) foreach ($domains[$domain] as &$entry) {
            if (!is_array($entry)) continue;
            unset($entry['_entityRevision'], $entry['_revision'], $entry['_movementUndo'], $entry['_floorTraversal']);
        }
        unset($entry);
        $assets = [];
        $scan = static function (array $value) use (&$scan, &$assets): void {
            foreach ($value as $key=>$item) {
                if (is_array($item)) $scan($item);
                elseif (in_array($key, ['mapUrl','imageUrl','thumbnailUrl','image','backgroundUrl','assetUrl'], true)
                    && is_string($item) && trim($item) !== '' && !str_starts_with($item, 'data:')) $assets[$item] = true;
            }
        };
        $scan([$scene, $domains]);
        $package = ['format'=>'gmscreen-scene/v1', 'exportedAt'=>gmdate('c'), 'sourceRevision'=>(int) ($snapshot['revision'] ?? 0),
            'scene'=>$scene, 'folder'=>$folder, 'domains'=>$domains, 'assetReferences'=>array_keys($assets),
            'scope'=>'Scene metadata and one canonical board snapshot. Image URLs are references; image files, character sheets, chat, and global combat are not bundled. Scene metadata is read separately from board state.'];
        if (strlen(json_encode($package, JSON_THROW_ON_ERROR)) > 16777216) throw new InvalidArgumentException('This scene exceeds the 16 MB JSON export limit.');
        return $package;
    }
}
