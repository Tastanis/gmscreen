<?php

const VTT_SCENES_FILE = __DIR__ . '/../data/vtt_scenes.json';
const VTT_MAP_UPLOAD_DIR = __DIR__ . '/../images/vtt/maps';
const VTT_CHANGE_LOG_FILE = __DIR__ . '/../data/vtt_change_log.json';
const VTT_CHANGE_LOG_MAX_ENTRIES = 200;

function currentUtcTimestamp()
{
    return gmdate('c');
}

function loadScenesData()
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
                'scenes' => normalizeScenesList($folder['scenes'] ?? [], $folderId),
            ];
        }
    }

    $rootScenes = normalizeScenesList($data['rootScenes'] ?? [], null);

    return [
        'folders' => $folders,
        'rootScenes' => $rootScenes,
    ];
}

function saveScenesData($data)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

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

function ensureScenesDataFile()
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
}

function normalizeScenesList($scenes, $folderId = null)
{
    if (!is_array($scenes)) {
        return [];
    }

    $normalized = [];
    foreach ($scenes as $scene) {
        if (!is_array($scene)) {
            continue;
        }
        $normalized[] = normalizeSceneRecordForStorage($scene, $folderId);
    }

    return $normalized;
}

function normalizeSceneRecordForStorage($scene, $folderId = null)
{
    if (!is_array($scene)) {
        $scene = [];
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

    $version = isset($scene['version']) ? (int) $scene['version'] : 1;
    if ($version < 1) {
        $version = 1;
    }

    $updatedAt = isset($scene['updatedAt']) && is_string($scene['updatedAt']) && $scene['updatedAt'] !== ''
        ? $scene['updatedAt']
        : currentUtcTimestamp();

    $normalizedFolderId = $folderId !== null && $folderId !== '' ? $folderId : null;
    if (array_key_exists('folderId', $scene)) {
        $sceneFolderId = $scene['folderId'];
        if ($sceneFolderId === null || $sceneFolderId === '') {
            $normalizedFolderId = null;
        } elseif (is_string($sceneFolderId) && trim($sceneFolderId) !== '') {
            $normalizedFolderId = trim($sceneFolderId);
        }
    }

    return [
        'id' => $sceneId,
        'name' => isset($scene['name']) ? (string) $scene['name'] : 'New Scene',
        'description' => isset($scene['description']) ? (string) $scene['description'] : '',
        'accent' => isset($scene['accent']) ? (string) $scene['accent'] : '',
        'map' => [
            'image' => isset($map['image']) ? (string) $map['image'] : '',
            'gridScale' => $gridScale,
        ],
        'version' => $version,
        'updatedAt' => $updatedAt,
        'folderId' => $normalizedFolderId,
    ];
}

function generateIdentifier($prefix)
{
    $prefix = (string) $prefix;

    try {
        return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
    } catch (Throwable $exception) {
        return sprintf('%s-%s', $prefix, uniqid());
    }
}

function flattenScenes($data)
{
    if (!is_array($data)) {
        $data = [];
    }
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

function createFolder($data, $name)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $name = (string) $name;
    $folder = [
        'id' => generateIdentifier('folder'),
        'name' => $name !== '' ? $name : 'Untitled Folder',
        'scenes' => [],
    ];

    $data['folders'][] = $folder;

    return [$data, $folder];
}

function createScene($data, $folderId = null, $name = null)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

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
        'version' => 1,
        'updatedAt' => currentUtcTimestamp(),
        'folderId' => $folderId,
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
        $scene['folderId'] = null;
        $data['rootScenes'][] = $scene;
    }

    return [$data, $scene];
}

function deleteScene($data, $sceneId)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $sceneId = (string) $sceneId;
    $removed = null;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as $index => $scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene['folderId'] = null;
                $removed = $scene;
                array_splice($data['rootScenes'], $index, 1);
                break;
            }
        }
    }

    if ($removed === null && isset($data['folders']) && is_array($data['folders'])) {
        foreach ($data['folders'] as &$folder) {
            if (!isset($folder['scenes']) || !is_array($folder['scenes'])) {
                continue;
            }
            foreach ($folder['scenes'] as $index => $scene) {
                if (isset($scene['id']) && $scene['id'] === $sceneId) {
                    $scene['folderId'] = $folder['id'] ?? null;
                    $removed = $scene;
                    array_splice($folder['scenes'], $index, 1);
                    break 2;
                }
            }
        }
        unset($folder);
    }

    return [$data, $removed];
}

function renameScene($data, $sceneId, $name)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $sceneId = (string) $sceneId;
    $trimmedName = trim($name);
    if ($trimmedName === '') {
        return [$data, null];
    }

    $updatedScene = null;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as &$scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene['name'] = $trimmedName;
                $scene['folderId'] = null;
                bumpSceneVersion($scene);
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
                    $scene['folderId'] = $folder['id'] ?? null;
                    bumpSceneVersion($scene);
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

function getSceneById($data, $sceneId)
{
    if (!is_array($data)) {
        return null;
    }

    $sceneId = (string) $sceneId;
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

function updateSceneMap($data, $sceneId, $imagePath, $gridScale)
{
    if (!is_array($data)) {
        $data = [
            'folders' => [],
            'rootScenes' => [],
        ];
    }

    $sceneId = (string) $sceneId;
    $updatedScene = null;

    if (isset($data['rootScenes']) && is_array($data['rootScenes'])) {
        foreach ($data['rootScenes'] as &$scene) {
            if (isset($scene['id']) && $scene['id'] === $sceneId) {
                $scene = applySceneMapChanges($scene, $imagePath, $gridScale, null);
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
                    $scene = applySceneMapChanges($scene, $imagePath, $gridScale, $folder['id'] ?? null);
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

function applySceneMapChanges($scene, $imagePath, $gridScale, $folderId)
{
    if (!is_array($scene)) {
        $scene = [];
    }

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

    $scene['folderId'] = $folderId !== null && $folderId !== '' ? $folderId : ($scene['folderId'] ?? null);
    bumpSceneVersion($scene);

    return $scene;
}

function bumpSceneVersion(&$scene)
{
    if (!is_array($scene)) {
        $scene = [];
    }
    $version = isset($scene['version']) ? (int) $scene['version'] : 1;
    if ($version < 1) {
        $version = 1;
    }
    $scene['version'] = $version + 1;
    $scene['updatedAt'] = currentUtcTimestamp();
}

function getFirstSceneId($data)
{
    if (!is_array($data)) {
        return null;
    }
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

function ensureMapUploadDirectory()
{
    if (!is_dir(VTT_MAP_UPLOAD_DIR)) {
        mkdir(VTT_MAP_UPLOAD_DIR, 0755, true);
    }
}

function buildMapImagePath($filename)
{
    $filename = (string) $filename;
    return '../images/vtt/maps/' . ltrim($filename, '/');
}

function sanitizeFileExtension($filename)
{
    $extension = strtolower(pathinfo((string) $filename, PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    return in_array($extension, $allowed, true) ? $extension : '';
}

function ensureChangeLogFile()
{
    $directory = dirname(VTT_CHANGE_LOG_FILE);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists(VTT_CHANGE_LOG_FILE)) {
        file_put_contents(
            VTT_CHANGE_LOG_FILE,
            json_encode([
                'last_id' => 0,
                'entries' => [],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
}

function loadChangeLogState()
{
    ensureChangeLogFile();

    $content = @file_get_contents(VTT_CHANGE_LOG_FILE);
    if ($content === false) {
        return [
            'last_id' => 0,
            'entries' => [],
        ];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [
            'last_id' => 0,
            'entries' => [],
        ];
    }

    $lastId = isset($data['last_id']) ? (int) $data['last_id'] : 0;
    $entries = [];
    if (isset($data['entries']) && is_array($data['entries'])) {
        foreach ($data['entries'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $entries[] = $entry;
        }
    }

    return [
        'last_id' => $lastId,
        'entries' => $entries,
    ];
}

function appendChangeLogEntry($entry)
{
    if (!is_array($entry)) {
        $entry = [];
    }
    ensureChangeLogFile();

    $fp = fopen(VTT_CHANGE_LOG_FILE, 'c+');
    if ($fp === false) {
        return [];
    }

    $writtenEntry = [];
    if (flock($fp, LOCK_EX)) {
        $content = stream_get_contents($fp);
        $state = json_decode($content, true);
        if (!is_array($state)) {
            $state = [
                'last_id' => 0,
                'entries' => [],
            ];
        }

        $lastId = isset($state['last_id']) ? (int) $state['last_id'] : 0;
        $nextId = $lastId + 1;

        $entry['id'] = $nextId;
        $entry['timestamp'] = currentUtcTimestamp();
        $state['last_id'] = $nextId;
        if (!isset($entry['payload']) || !is_array($entry['payload'])) {
            $entry['payload'] = [];
        }

        $entries = isset($state['entries']) && is_array($state['entries']) ? $state['entries'] : [];
        $entries[] = $entry;
        if (count($entries) > VTT_CHANGE_LOG_MAX_ENTRIES) {
            $entries = array_slice($entries, -VTT_CHANGE_LOG_MAX_ENTRIES);
        }
        $state['entries'] = $entries;

        $payload = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($payload !== false) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, $payload);
            fflush($fp);
            $writtenEntry = $entry;
        }

        flock($fp, LOCK_UN);
    }

    fclose($fp);

    return $writtenEntry;
}

function getSceneChangesSince($changeId)
{
    $changeId = (int) $changeId;
    $state = loadChangeLogState();
    $entries = $state['entries'] ?? [];
    $since = $changeId < 0 ? 0 : $changeId;

    return array_values(array_filter($entries, static function ($entry) use ($since) {
        if (!is_array($entry)) {
            return false;
        }
        if (!isset($entry['id'])) {
            return false;
        }
        return (int) $entry['id'] > $since;
    }));
}

function getLatestChangeId()
{
    $state = loadChangeLogState();
    return isset($state['last_id']) ? (int) $state['last_id'] : 0;
}

function recordSceneChange($scene, $operation)
{
    $normalized = normalizeSceneForPayload($scene);
    return appendChangeLogEntry([
        'entityType' => 'scene',
        'entityId' => $normalized['id'],
        'operation' => $operation,
        'version' => $normalized['version'],
        'payload' => [
            'scene' => $normalized,
        ],
    ]);
}

function recordSceneDeletion($scene)
{
    $normalized = normalizeSceneForPayload($scene);
    return appendChangeLogEntry([
        'entityType' => 'scene',
        'entityId' => $normalized['id'],
        'operation' => 'deleted',
        'version' => $normalized['version'],
        'payload' => [
            'scene' => $normalized,
        ],
    ]);
}

function recordFolderChange($folder, $operation)
{
    if (!is_array($folder)) {
        $folder = [];
    }

    $folderId = isset($folder['id']) ? (string) $folder['id'] : '';
    $folderName = isset($folder['name']) ? (string) $folder['name'] : 'Untitled Folder';

    return appendChangeLogEntry([
        'entityType' => 'folder',
        'entityId' => $folderId,
        'operation' => $operation,
        'version' => null,
        'payload' => [
            'folder' => [
                'id' => $folderId,
                'name' => $folderName,
            ],
        ],
    ]);
}

function recordActiveSceneChange($scene)
{
    $scenePayload = $scene !== null ? normalizeSceneForPayload($scene) : null;
    $sceneId = $scenePayload['id'] ?? '';
    $version = $scenePayload['version'] ?? null;

    return appendChangeLogEntry([
        'entityType' => 'active_scene',
        'entityId' => $sceneId,
        'operation' => 'changed',
        'version' => $version,
        'payload' => [
            'activeSceneId' => $sceneId,
            'scene' => $scenePayload,
        ],
    ]);
}

function normalizeSceneForPayload($scene)
{
    if (!is_array($scene)) {
        $scene = [];
    }
    $map = isset($scene['map']) && is_array($scene['map']) ? $scene['map'] : [];
    $gridScale = isset($map['gridScale']) ? (int) $map['gridScale'] : 50;
    if ($gridScale < 10) {
        $gridScale = 10;
    }
    if ($gridScale > 300) {
        $gridScale = 300;
    }

    $folderId = null;
    if (isset($scene['folderId'])) {
        $folderValue = $scene['folderId'];
        if (is_string($folderValue) && trim($folderValue) !== '') {
            $folderId = trim($folderValue);
        }
    }

    $version = isset($scene['version']) ? (int) $scene['version'] : 1;
    if ($version < 1) {
        $version = 1;
    }

    $updatedAt = isset($scene['updatedAt']) && is_string($scene['updatedAt']) && $scene['updatedAt'] !== ''
        ? $scene['updatedAt']
        : currentUtcTimestamp();

    return [
        'id' => isset($scene['id']) ? (string) $scene['id'] : generateIdentifier('scene'),
        'name' => isset($scene['name']) ? (string) $scene['name'] : 'New Scene',
        'description' => isset($scene['description']) ? (string) $scene['description'] : '',
        'accent' => isset($scene['accent']) ? (string) $scene['accent'] : '',
        'map' => [
            'image' => isset($map['image']) ? (string) $map['image'] : '',
            'gridScale' => $gridScale,
        ],
        'version' => $version,
        'updatedAt' => $updatedAt,
        'folderId' => $folderId,
    ];
}

