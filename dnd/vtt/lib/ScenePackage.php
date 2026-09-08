<?php
declare(strict_types=1);

/** Read-only scene package. No imports, asset fetches, or board writes. */
final class ScenePackage
{
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
