<?php
declare(strict_types=1);

/** Read-only restore planning; only the listed scope may later be applied. */
final class SceneCheckpointRestore
{
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
