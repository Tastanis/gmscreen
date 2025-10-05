<?php

declare(strict_types=1);

const VTT_SCENES_FILE = __DIR__ . '/../data/vtt_scenes.json';
const VTT_MAP_UPLOAD_DIR = __DIR__ . '/../images/vtt/maps';
const VTT_SCENE_CHANGES_FILE = __DIR__ . '/../data/vtt_scene_changes.json';

function loadScenesData(): array
{
    ensureScenesDataFile();

    $content = @file_get_contents(VTT_SCENES_FILE);
    if ($content === false) {
        return [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $folders = [];
    if (isset($data['folders']) && is_array($data['folders'])) {
        foreach ($data['folders'] as $folder) {
            if (!is_array($folder)) {
                continue;
            }
            $folderId = isset($folder['id']) ? (string) $folder['id'] : '';
            if ($folderId === '') {
                $folderId = generateIdentifier('folder');
            }
            $folders[] = [
                'id' => $folderId,
                'name' => isset($folder['name']) ? (string) $folder['name'] : 'Untitled Folder',
                'scenes' => normalizeScenesList($folder['scenes'] ?? []),
            ];
        }
    }

    $rootScenes = normalizeScenesList($data['rootScenes'] ?? []);

    return [
        'folders' => $folders,
        'rootScenes' => $rootScenes,
    ];
}

function saveScenesData(array $data): bool
{
    ensureScenesDataFile();

    $payload = json_encode([
        'folders' => $data['folders'] ?? [],
        'rootScenes' => $data['rootScenes'] ?? [],
    ], JSON_PRETTY_PRINT);

    if ($payload === false) {
        return false;
    }

    $fp = fopen(VTT_SCENES_FILE, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $bytesWritten = fwrite($fp, $payload);
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytesWritten !== false;
    }

    fclose($fp);
    return $result;
}

function ensureScenesDataFile(): void
{
    $directory = dirname(VTT_SCENES_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_SCENES_FILE)) {
        file_put_contents(
            VTT_SCENES_FILE,
            json_encode([
                'folders' => [],
                'rootScenes' => [],
            ], JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    ensureSceneChangesFile();
}

function normalizeScenesList($scenes): array
{
    if (!is_array($scenes)) {
        return [];
    }

    $normalized = [];
    foreach ($scenes as $scene) {
        if (!is_array($scene)) {
            continue;
        }
        $sceneId = isset($scene['id']) ? (string) $scene['id'] : generateIdentifier('scene');
        $map = isset($scene['map']) && is_array($scene['map']) ? $scene['map'] : [];
        $gridScale = isset($map['gridScale']) ? (int) $map['gridScale'] : 50;
        if ($gridScale < 10) {
            $gridScale = 10;
        }
        if ($gridScale > 300) {
            $gridScale = 300;
        }
        $normalized[] = [
            'id' => $sceneId,
            'name' => isset($scene['name']) ? (string) $scene['name'] : 'New Scene',
            'description' => isset($scene['description']) ? (string) $scene['description'] : '',
            'accent' => isset($scene['accent']) ? (string) $scene['accent'] : '',
            'map' => [
                'image' => isset($map['image']) ? (string) $map['image'] : '',
                'gridScale' => $gridScale,
            ],
        ];
    }

    return $normalized;
}

function generateIdentifier(string $prefix): string
{
    try {
        return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
    } catch (Throwable $exception) {
        return sprintf('%s-%s', $prefix, uniqid());
    }
}

function flattenScenes(array $data): array
{
    $scenes = [];
    foreach ($data['rootScenes'] ?? [] as $scene) {
        if (!is_array($scene)) {
            continue;
        }
        $scene['folderId'] = null;
        $scenes[] = $scene;
    }

    foreach ($data['folders'] ?? [] as $folder) {
        if (!is_array($folder) || !isset($folder['scenes'])) {
            continue;
        }
        $folderId = $folder['id'] ?? null;
        foreach ($folder['scenes'] as $scene) {
            if (!is_array($scene)) {
                continue;
            }
            $scene['folderId'] = $folderId;
            $scenes[] = $scene;
        }
    }

    return $scenes;
}

function createFolder(array $data, string $name): array
{
    $folder = [
        'id' => generateIdentifier('folder'),
        'name' => $name !== '' ? $name : 'Untitled Folder',
        'scenes' => [],
    ];

    $data['folders'][] = $folder;

    return [$data, $folder];
}

function createScene(array $data, ?string $folderId = null, ?string $name = null): array
{
    $trimmedName = $name !== null ? trim($name) : '';
    $scene = [
        'id' => generateIdentifier('scene'),
        'name' => $trimmedName !== '' ? $trimmedName : 'New Scene',
        'description' => '',
        'accent' => '',
        'map' => [
            'image' => '',
            'gridScale' => 50,
        ],
    ];

    $folderAttached = false;
    if ($folderId !== null) {
        foreach ($data['folders'] as &$folder) {
            if (isset($folder['id']) && $folder['id'] === $folderId) {
                if (!isset($folder['scenes']) || !is_array($folder['scenes'])) {
                    $folder['scenes'] = [];
                }
                $folder['scenes'][] = $scene;
                $folderAttached = true;
                break;
            }
        }
        unset($folder);
    }

    if (!$folderAttached) {
        if (!isset($data['rootScenes']) || !is_array($data['rootScenes'])) {
            $data['rootScenes'] = [];
        }
        $data['rootScenes'][] = $scene;
    }

    return [$data, $scene];
}

function deleteScene(array $data, string $sceneId): array
{
    $removed = false;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as $index => $scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                array_splice($data['rootScenes'], $index, 1);
                $removed = true;
                break;
            }
        }
    }

    if (!$removed && isset($data['folders']) && is_array($data['folders'])) {
        foreach ($data['folders'] as &$folder) {
            if (!isset($folder['scenes']) || !is_array($folder['scenes'])) {
                continue;
            }
            foreach ($folder['scenes'] as $index => $scene) {
                if (isset($scene['id']) && $scene['id'] === $sceneId) {
                    array_splice($folder['scenes'], $index, 1);
                    $removed = true;
                    break 2;
                }
            }
        }
        unset($folder);
    }

    return [$data, $removed];
}

function renameScene(array $data, string $sceneId, string $name): array
{
    $trimmedName = trim($name);
    if ($trimmedName === '') {
        return [$data, null];
    }

    $updatedScene = null;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as &$scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene['name'] = $trimmedName;
                $updatedScene = $scene;
                break;
            }
        }
        unset($scene);
    }

    if ($updatedScene === null && isset($data['folders']) && is_array($data['folders'])) {
        foreach ($data['folders'] as &$folder) {
            if (!isset($folder['scenes']) || !is_array($folder['scenes'])) {
                continue;
            }
            foreach ($folder['scenes'] as &$scene) {
                if (isset($scene['id']) && $scene['id'] === $sceneId) {
                    $scene['name'] = $trimmedName;
                    $updatedScene = $scene;
                    break 2;
                }
            }
            unset($scene);
        }
        unset($folder);
    }

    return [$data, $updatedScene];
}

function getSceneById(array $data, string $sceneId): ?array
{
    foreach ($data['rootScenes'] ?? [] as $scene) {
        if (isset($scene['id']) && $scene['id'] === $sceneId) {
            $scene['folderId'] = null;
            return $scene;
        }
    }

    foreach ($data['folders'] ?? [] as $folder) {
        foreach ($folder['scenes'] ?? [] as $scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene['folderId'] = $folder['id'] ?? null;
                return $scene;
            }
        }
    }

    return null;
}

function updateSceneMap(array $data, string $sceneId, ?string $imagePath, ?int $gridScale): array
{
    $updatedScene = null;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as &$scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene = applySceneMapChanges($scene, $imagePath, $gridScale);
                $updatedScene = $scene;
                break;
            }
        }
        unset($scene);
    }

    if ($updatedScene === null && isset($data['folders']) && is_array($data['folders'])) {
        foreach ($data['folders'] as &$folder) {
            if (!isset($folder['scenes']) || !is_array($folder['scenes'])) {
                continue;
            }
            foreach ($folder['scenes'] as &$scene) {
                if (isset($scene['id']) && $scene['id'] === $sceneId) {
                    $scene = applySceneMapChanges($scene, $imagePath, $gridScale);
                    $updatedScene = $scene;
                    break 2;
                }
            }
            unset($scene);
        }
        unset($folder);
    }

    return [$data, $updatedScene];
}

function applySceneMapChanges(array $scene, ?string $imagePath, ?int $gridScale): array
{
    if (!isset($scene['map']) || !is_array($scene['map'])) {
        $scene['map'] = [];
    }

    if ($imagePath !== null) {
        $scene['map']['image'] = $imagePath;
    }

    if ($gridScale !== null) {
        if ($gridScale < 10) {
            $gridScale = 10;
        }
        if ($gridScale > 300) {
            $gridScale = 300;
        }
        $scene['map']['gridScale'] = $gridScale;
    }

    return $scene;
}

function getFirstSceneId(array $data): ?string
{
    if (!empty($data['rootScenes'])) {
        $first = $data['rootScenes'][0];
        if (isset($first['id'])) {
            return $first['id'];
        }
    }

    foreach ($data['folders'] ?? [] as $folder) {
        if (!empty($folder['scenes'])) {
            $first = $folder['scenes'][0];
            if (isset($first['id'])) {
                return $first['id'];
            }
        }
    }

    return null;
}

function ensureSceneChangesFile(): void
{
    $directory = dirname(VTT_SCENE_CHANGES_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_SCENE_CHANGES_FILE)) {
        file_put_contents(
            VTT_SCENE_CHANGES_FILE,
            json_encode([
                'latest_change_id' => 0,
                'changes' => [],
            ], JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}

function loadSceneChangeState(): array
{
    ensureSceneChangesFile();

    $state = [
        'latest_change_id' => 0,
        'changes' => [],
    ];

    $fp = fopen(VTT_SCENE_CHANGES_FILE, 'c+');
    if ($fp === false) {
        return $state;
    }

    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                if (isset($decoded['latest_change_id'])) {
                    $state['latest_change_id'] = (int) $decoded['latest_change_id'];
                }
                if (isset($decoded['changes']) && is_array($decoded['changes'])) {
                    $state['changes'] = array_values(array_filter($decoded['changes'], 'is_array'));
                }
            }
        }
        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return $state;
}

function saveSceneChangeState(array $state): bool
{
    ensureSceneChangesFile();

    $payload = json_encode([
        'latest_change_id' => isset($state['latest_change_id']) ? (int) $state['latest_change_id'] : 0,
        'changes' => isset($state['changes']) && is_array($state['changes']) ? array_values($state['changes']) : [],
    ], JSON_PRETTY_PRINT);

    if ($payload === false) {
        return false;
    }

    $fp = fopen(VTT_SCENE_CHANGES_FILE, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $bytesWritten = fwrite($fp, $payload);
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytesWritten !== false;
    }

    fclose($fp);

    return $result;
}

function recordSceneChange(string $entityType, ?string $entityId, array $payload = []): ?int
{
    ensureSceneChangesFile();

    $fp = fopen(VTT_SCENE_CHANGES_FILE, 'c+');
    if ($fp === false) {
        return null;
    }

    $recordedId = null;

    if (flock($fp, LOCK_EX)) {
        $content = stream_get_contents($fp);
        $state = [
            'latest_change_id' => 0,
            'changes' => [],
        ];

        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                if (isset($decoded['latest_change_id'])) {
                    $state['latest_change_id'] = (int) $decoded['latest_change_id'];
                }
                if (isset($decoded['changes']) && is_array($decoded['changes'])) {
                    $state['changes'] = array_values(array_filter($decoded['changes'], 'is_array'));
                }
            }
        }

        $nextId = $state['latest_change_id'] + 1;
        $entry = [
            'id' => $nextId,
            'entityType' => $entityType,
            'entityId' => $entityId !== null ? (string) $entityId : null,
            'payload' => $payload,
            'timestamp' => time(),
        ];

        $state['latest_change_id'] = $nextId;
        $state['changes'][] = $entry;

        $maxEntries = 200;
        if (count($state['changes']) > $maxEntries) {
            $state['changes'] = array_slice($state['changes'], -$maxEntries);
        }

        $payloadEncoded = json_encode([
            'latest_change_id' => $state['latest_change_id'],
            'changes' => $state['changes'],
        ], JSON_PRETTY_PRINT);

        if ($payloadEncoded !== false) {
            ftruncate($fp, 0);
            rewind($fp);
            $bytesWritten = fwrite($fp, $payloadEncoded);
            fflush($fp);
            if ($bytesWritten !== false) {
                $recordedId = $nextId;
            }
        }

        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return $recordedId;
}

function getSceneChangesSince(int $sinceId): array
{
    $state = loadSceneChangeState();

    $latestId = isset($state['latest_change_id']) ? (int) $state['latest_change_id'] : 0;
    $changes = [];

    foreach ($state['changes'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $entryId = isset($entry['id']) ? (int) $entry['id'] : 0;
        if ($entryId > $sinceId) {
            $changes[] = [
                'id' => $entryId,
                'entityType' => isset($entry['entityType']) ? (string) $entry['entityType'] : '',
                'entityId' => isset($entry['entityId']) ? $entry['entityId'] : null,
                'payload' => isset($entry['payload']) && is_array($entry['payload']) ? $entry['payload'] : [],
                'timestamp' => isset($entry['timestamp']) ? (int) $entry['timestamp'] : time(),
            ];
        }
    }

    return [$changes, $latestId];
}

function getLatestSceneChangeId(): int
{
    $state = loadSceneChangeState();
    return isset($state['latest_change_id']) ? (int) $state['latest_change_id'] : 0;
}

function ensureMapUploadDirectory(): void
{
    if (!is_dir(VTT_MAP_UPLOAD_DIR)) {
        mkdir(VTT_MAP_UPLOAD_DIR, 0755, true);
    }
}

function buildMapImagePath(string $filename): string
{
    return '../images/vtt/maps/' . ltrim($filename, '/');
}

function sanitizeFileExtension(string $filename): string
{
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    return in_array($extension, $allowed, true) ? $extension : '';
}

