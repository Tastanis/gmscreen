<?php
declare(strict_types=1);

/** Read-only scene package. No imports, asset fetches, or board writes. */
final class ScenePackage
{
    /** Pure preparation only. The installer must still validate fields and reserve the target ID. */
    public static function prepareForNewScene(array $package, string $targetSceneId): array
    {
        self::preview($package);
        if (!preg_match('/^scn-[a-zA-Z0-9_-]{8,120}$/', $targetSceneId) || $targetSceneId === $package['scene']['id']) {
            throw new InvalidArgumentException('A distinct reserved scene ID is required.');
        }
        $copy = self::build($package['scene'], ['state'=>array_map(static fn($data)=>[$package['scene']['id']=>$data], $package['domains'])]);
        $fresh = static fn(string $domain, string $id): string => 'copy-' . substr(hash('sha256', $targetSceneId . "\0" . $domain . "\0" . $id), 0, 40);
        $maps = ['levels'=>['level-0'=>'level-0']];
        foreach ($copy['domains']['sceneConfig']['mapLevels']['levels'] ?? [] as $floor) $maps['levels'][$floor['id']] = $fresh('levels', $floor['id']);
        foreach (['placements','drawings','templates'] as $domain) {
            $maps[$domain] = [];
            foreach ($copy['domains'][$domain] as $id=>$entry) $maps[$domain][$id] = $fresh($domain, (string) $id);
        }
        $placementRef = static function ($id) use ($maps): string {
            if (!is_string($id) || !isset($maps['placements'][$id])) throw new InvalidArgumentException('A copied effect references a token outside this scene.');
            return $maps['placements'][$id];
        };
        foreach (['placements','drawings','templates'] as $domain) {
            $entries = [];
            foreach ($copy['domains'][$domain] as $oldId=>$entry) {
                $entry['id'] = $maps[$domain][$oldId];
                $entry['levelId'] = $maps['levels'][$entry['levelId'] ?? 'level-0'];
                if (isset($entry['sceneId'])) $entry['sceneId'] = $targetSceneId;
                if ($domain === 'placements') {
                    foreach ($entry['conditions'] ?? [] as $index=>$condition) {
                        if (!is_array($condition)) continue;
                        if (!empty($condition['sourceId'])) $condition['sourceId'] = $placementRef($condition['sourceId']);
                        foreach (['targetTokenId','tokenId'] as $field) if (!empty($condition['duration'][$field])) $condition['duration'][$field] = $placementRef($condition['duration'][$field]);
                        if (!empty($condition['targetTokenId'])) $condition['targetTokenId'] = $placementRef($condition['targetTokenId']);
                        unset($condition['instanceId'], $condition['riderExecutions']);
                        $entry['conditions'][$index] = $condition;
                    }
                    foreach (['marks','activeMarks'] as $field) foreach ($entry[$field] ?? [] as $type=>$mark) {
                        if (!is_array($mark)) throw new InvalidArgumentException('Invalid copied mark.');
                        foreach (['sourceId','targetId'] as $ref) if (isset($mark[$ref])) $mark[$ref] = $placementRef($mark[$ref]);
                        $entry[$field][$type] = $mark;
                    }
                }
                $entries[$entry['id']] = $entry;
            }
            $copy['domains'][$domain] = $entries;
        }
        $geometry = static function (array $items, string $scope, bool $stairs) use ($fresh, $maps): array {
            foreach ($items as $index=>&$item) {
                $item['id'] = $fresh($scope, (string) $index);
                if ($stairs && isset($item['linkedLevelId'])) $item['linkedLevelId'] = $maps['levels'][$item['linkedLevelId']];
            }
            return $items;
        };
        $config = &$copy['domains']['sceneConfig'];
        foreach (['activeLevelId','activeLevel','selectedLevelId'] as $field) if (isset($config['mapLevels'][$field])) {
            $id = $config['mapLevels'][$field];
            if (!is_string($id) || !isset($maps['levels'][$id])) throw new InvalidArgumentException('The selected floor is missing.');
            $config['mapLevels'][$field] = $maps['levels'][$id];
        }
        if (isset($config['mapLevels']['baseStairs'])) $config['mapLevels']['baseStairs'] = $geometry($config['mapLevels']['baseStairs'], 'base-stairs', true);
        foreach ($config['mapLevels']['levels'] ?? [] as $index=>$floor) {
            $oldId = $floor['id']; $floor['id'] = $maps['levels'][$oldId];
            foreach (['stairs','cutouts'] as $field) if (isset($floor[$field])) $floor[$field] = $geometry($floor[$field], $oldId . '-' . $field, $field === 'stairs');
            $config['mapLevels']['levels'][$index] = $floor;
        }
        if (isset($config['fogOfWar']['byLevel'])) {
            $fog = [];
            foreach ($config['fogOfWar']['byLevel'] as $id=>$value) $fog[$maps['levels'][$id]] = $value;
            $config['fogOfWar']['byLevel'] = $fog;
        }
        unset($config);
        $copy['scene']['id'] = $targetSceneId;
        $copy['scene']['folderId'] = null;
        $copy['folder'] = null;
        $copy['sourceRevision'] = 0;
        self::preview($copy);
        return ['package'=>$copy, 'idMap'=>$maps];
    }

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
