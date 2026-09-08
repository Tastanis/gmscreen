<?php
declare(strict_types=1);
require_once __DIR__ . '/FloorGeometry.php';

/** Read-only restore planning; only the listed scope may later be applied. */
final class SceneCheckpointRestore
{
    /** Read-only layout plan. linkedPlayers maps roster IDs to their current primary
     * placement IDs; callers derive it from canonical state, never client input. */
    public static function planLayout(array $checkpoint, array $snapshot, array $linkedPlayers = []): array
    {
        $sceneId = $checkpoint['sceneId'];
        // Reuse format/existence validation, but evaluate positions against saved floors.
        self::previewPositions($checkpoint, $snapshot);
        $saved = $checkpoint['data']['domains'];
        $state = $snapshot['state'];
        $currentConfig = $state['sceneConfig'][$sceneId] ?? [];
        $config = $currentConfig;
        $configChanges = [];
        foreach (['mapLevels','grid','fogOfWar'] as $field) {
            $value = $saved['sceneConfig'][$field] ?? [];
            if (!is_array($value)) throw new InvalidArgumentException('Checkpoint contains invalid scene geometry.');
            if (($config[$field] ?? []) !== $value) $configChanges[] = $field;
            $config[$field] = $value;
        }
        $levels = ['level-0'=>['id'=>'level-0']];
        foreach ($config['mapLevels']['levels'] ?? [] as $floor) {
            if (!is_array($floor) || !is_string($floor['id'] ?? null) || isset($levels[$floor['id']])) throw new InvalidArgumentException('Checkpoint contains invalid floor IDs.');
            $levels[$floor['id']] = $floor;
        }
        $plannedSnapshot = $snapshot;
        $plannedSnapshot['state']['sceneConfig'][$sceneId] = $config;
        $positions = self::previewPositions($checkpoint, $plannedSnapshot);
        $placements = $state['placements'][$sceneId] ?? [];
        $destinations = array_column($positions['changes'], 'to', 'id');
        $changes = [];
        foreach ($placements as $id=>&$placement) {
            $from = self::position($placement);
            if ($from === null) throw new InvalidArgumentException('A current token has invalid coordinates; repair it before restoring layout.');
            $next = $destinations[$id] ?? $from;
            $reason = isset($destinations[$id]) ? 'Checkpoint position' : 'Current position';
            if (!isset($levels[$next['levelId']])) { $next['levelId']='level-0'; $reason='Current floor is absent from the checkpoint'; }
            $candidate = [...$placement,...$next];
            if (!FloorGeometry::isAirborne($candidate)) {
                $fall = FloorGeometry::fallingDestination($candidate,$config['mapLevels']);
                if ($fall !== null) { $next['levelId']=$fall; $reason='Restored geometry does not support this token'; }
            }
            if ($from !== $next) {
                $changes[] = ['id'=>$id,'name'=>(string)($placement['name'] ?? $id),'from'=>$from,'to'=>$next,'reason'=>$reason,
                    'newer'=>!isset($saved['placements'][$id]),'entityRevision'=>(int)($placement['_entityRevision'] ?? 0)];
                $placement = [...$placement,...$next];
            }
            // Undo/traversal receipts describe geometry which may no longer exist.
            unset($placement['_movementUndo'],$placement['_floorTraversal']);
        }
        unset($placement);
        $views = $config['userLevelState'] ?? [];
        foreach ($linkedPlayers as $userId=>$placementId) {
            if (!is_string($placementId) || !isset($placements[$placementId]) || ($views[$userId]['followToken'] ?? true) === false) continue;
            $beforeLevel = $state['placements'][$sceneId][$placementId]['levelId'] ?? 'level-0';
            $afterLevel = $placements[$placementId]['levelId'] ?? 'level-0';
            if ($beforeLevel !== $afterLevel) $views[$userId] = [...($views[$userId] ?? []),'levelId'=>$afterLevel,'source'=>'checkpoint','tokenId'=>$placementId];
        }
        foreach ($views as $userId=>&$view) {
            $floor = $levels[$view['levelId'] ?? 'level-0'] ?? null;
            if ($floor === null || (strtolower((string)$userId) !== 'gm' && ($floor['hidden'] ?? false) === true)) {
                $view['levelId']='level-0'; $view['source']='checkpoint-floor-repair';
            }
        }
        unset($view);
        $viewChanges=[];
        foreach ($views as $userId=>$view) if ($view !== ($currentConfig['userLevelState'][$userId] ?? null)) $viewChanges[]=['userId'=>$userId,'from'=>$currentConfig['userLevelState'][$userId]['levelId'] ?? null,'to'=>$view['levelId']];
        $config['userLevelState']=$views;
        $domains=['placements'=>$placements,'sceneConfig'=>$config]; $content=[];
        foreach (['drawings','templates'] as $domain) {
            $entries=$saved[$domain] ?? [];
            if (!is_array($entries)) throw new InvalidArgumentException('Checkpoint contains invalid board content.');
            foreach ($entries as $entry) if (!is_array($entry) || !isset($levels[$entry['levelId'] ?? 'level-0'])) throw new InvalidArgumentException('Checkpoint content references a missing floor.');
            $current=$state[$domain][$sceneId] ?? [];
            $updated=0;
            foreach (array_intersect_key($entries,$current) as $id=>$entry) {
                $old=$current[$id]; unset($entry['_entityRevision'],$entry['_revision'],$old['_entityRevision'],$old['_revision']);
                if ($entry !== $old) $updated++;
            }
            $content[$domain]=['added'=>count(array_diff_key($entries,$current)),'removed'=>count(array_diff_key($current,$entries)),'updated'=>$updated];
            $domains[$domain]=$entries;
        }
        return ['domains'=>$domains,'preview'=>[
            'scope'=>'layout','checkpointId'=>$checkpoint['id'],'checkpointName'=>$checkpoint['name'],'sceneId'=>$sceneId,
            'baseRevision'=>(int)$snapshot['revision'],'changes'=>$changes,'skipped'=>$positions['skipped'],
            'newerTokensPreserved'=>$positions['newerTokensPreserved'],'geometryFields'=>$configChanges,'content'=>$content,
            'viewerChanges'=>$viewChanges,'savedFloorCount'=>count($levels),
            'hasChanges'=>$changes!==[] || $configChanges!==[] || $viewChanges!==[] || array_sum(array_merge(array_values($content['drawings']),array_values($content['templates'])))>0,
        ]];
    }

    public static function previewPositions(array $checkpoint, array $snapshot): array
    {
        $sceneId = $checkpoint['sceneId'];
        if (($checkpoint['data']['format'] ?? '') !== 'vtt-scene-checkpoint/v1') {
            throw new InvalidArgumentException('Unsupported checkpoint format.');
        }
        $state = $snapshot['state'] ?? [];
        if (!isset($state['placements'][$sceneId]) && !isset($state['sceneConfig'][$sceneId])) {
            throw new InvalidArgumentException('The checkpoint scene no longer has saved board state.');
        }
        $saved = $checkpoint['data']['domains']['placements'] ?? [];
        $current = $state['placements'][$sceneId] ?? [];
        $levels = ['level-0'=>true];
        foreach (($state['sceneConfig'][$sceneId]['mapLevels']['levels'] ?? []) as $level) {
            if (is_array($level) && isset($level['id'])) $levels[$level['id']] = true;
        }
        $changes = []; $skipped = []; $unchanged = 0;
        foreach ($saved as $id => $token) {
            $name = (string) ($current[$id]['name'] ?? $token['name'] ?? $id);
            if (!isset($current[$id])) { $skipped[] = ['id'=>$id, 'name'=>$name, 'reason'=>'Token no longer on this scene']; continue; }
            $destination = self::position($token);
            if ($destination === null) { $skipped[] = ['id'=>$id, 'name'=>$name, 'reason'=>'Checkpoint position is invalid']; continue; }
            if (!isset($levels[$destination['levelId']])) { $skipped[] = ['id'=>$id, 'name'=>$name, 'reason'=>'Checkpoint floor no longer exists']; continue; }
            $from = self::position($current[$id]);
            if ($from === $destination) { $unchanged++; continue; }
            $changes[] = ['id'=>$id, 'name'=>$name, 'from'=>$from, 'to'=>$destination,
                'entityRevision'=>(int) ($current[$id]['_entityRevision'] ?? 0)];
        }
        $savedConfig = $checkpoint['data']['domains']['sceneConfig'] ?? [];
        $currentConfig = $state['sceneConfig'][$sceneId] ?? [];
        $geometryChanged = ($savedConfig['mapLevels'] ?? []) !== ($currentConfig['mapLevels'] ?? [])
            || ($savedConfig['grid'] ?? []) !== ($currentConfig['grid'] ?? []);
        return ['checkpointId'=>$checkpoint['id'], 'checkpointName'=>$checkpoint['name'], 'scope'=>'positions',
            'sceneId'=>$sceneId, 'baseRevision'=>(int) $snapshot['revision'], 'changes'=>$changes, 'skipped'=>$skipped,
            'unchanged'=>$unchanged, 'newerTokensPreserved'=>count(array_diff_key($current, $saved)), 'geometryChanged'=>$geometryChanged];
    }

    private static function position(array $token): ?array
    {
        $column = $token['column'] ?? null; $row = $token['row'] ?? null;
        if (!is_numeric($column) || !is_numeric($row)) return null;
        $column = (float) $column; $row = (float) $row;
        if (!is_finite($column) || !is_finite($row) || min($column, $row) < 0 || max($column, $row) > 100000) return null;
        return ['column'=>$column, 'row'=>$row, 'levelId'=>(string) ($token['levelId'] ?? 'level-0')];
    }
}
