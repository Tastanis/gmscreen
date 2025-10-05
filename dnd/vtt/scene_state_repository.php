<?php

declare(strict_types=1);

const VTT_SCENE_STATE_FILE = __DIR__ . '/../data/vtt_active_scene.json';

function getSceneStateFilePath(): string
{
    return VTT_SCENE_STATE_FILE;
}

function ensureSceneStateFile(?string $filePath = null, ?string $defaultSceneId = null): void
{
    $path = $filePath ?? getSceneStateFilePath();
    $directory = dirname($path);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists($path)) {
        $initialId = $defaultSceneId !== null ? (string) $defaultSceneId : '';
        $payload = json_encode(['active_scene_id' => $initialId], JSON_PRETTY_PRINT);
        if ($payload === false) {
            $payload = '{"active_scene_id": ""}';
        }
        file_put_contents($path, $payload, LOCK_EX);
    }
}

function loadActiveSceneId(array $sceneLookup, ?string $defaultSceneId = null, ?string $filePath = null): ?string
{
    $path = $filePath ?? getSceneStateFilePath();
    ensureSceneStateFile($path, $defaultSceneId);

    $fp = fopen($path, 'c+');
    if ($fp === false) {
        return $defaultSceneId !== null && isset($sceneLookup[$defaultSceneId]) ? $defaultSceneId : null;
    }

    $storedId = null;
    $explicitlyCleared = false;
    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp) ?: '';
        flock($fp, LOCK_UN);
        $data = json_decode($content, true);
        if (is_array($data) && array_key_exists('active_scene_id', $data)) {
            $candidate = (string) $data['active_scene_id'];
            if ($candidate === '') {
                $explicitlyCleared = true;
            } elseif (isset($sceneLookup[$candidate])) {
                $storedId = $candidate;
            }
        }
    }
    fclose($fp);

    if ($storedId !== null) {
        return $storedId;
    }

    if ($explicitlyCleared) {
        return null;
    }

    if ($defaultSceneId !== null && isset($sceneLookup[$defaultSceneId])) {
        saveActiveSceneId($defaultSceneId, $path);
        return $defaultSceneId;
    }

    saveActiveSceneId('', $path);
    return null;
}

function saveActiveSceneId($sceneId, ?string $filePath = null): bool
{
    $path = $filePath ?? getSceneStateFilePath();
    $directory = dirname($path);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    $fp = fopen($path, 'c+');
    if ($fp === false) {
        return false;
    }

    $value = '';
    if (is_string($sceneId)) {
        $value = $sceneId;
    } elseif ($sceneId !== null) {
        $value = (string) $sceneId;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $payload = json_encode(['active_scene_id' => $value], JSON_PRETTY_PRINT);
        if ($payload === false) {
            $payload = '{"active_scene_id": ""}';
        }
        $bytesWritten = fwrite($fp, $payload);
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytesWritten !== false;
    }

    fclose($fp);
    return $result;
}
