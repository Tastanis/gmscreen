<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/** @return array<string,mixed> */
function taskAppInitialData(): array
{
    return [
        'schemaVersion' => 1,
        'activeListId' => 'inbox',
        'lists' => [[
            'id' => 'inbox',
            'name' => 'Tasks',
            'createdAt' => gmdate('c'),
        ]],
        'tasks' => [],
    ];
}

function taskAppBoundedString(mixed $value, int $maximum, bool $required = false): string
{
    if (!is_string($value)) {
        if ($required) {
            throw new InvalidArgumentException('A required text value is invalid.');
        }
        return '';
    }
    $value = trim($value);
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if (($required && $value === '') || $length > $maximum) {
        throw new InvalidArgumentException('A text value is empty or too long.');
    }
    return $value;
}

function taskAppSafeId(mixed $value): string
{
    $id = taskAppBoundedString($value, 128, true);
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) {
        throw new InvalidArgumentException('An item ID is invalid.');
    }
    return $id;
}

function taskAppTimestamp(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $timestamp = taskAppBoundedString($value, 40);
    if ($timestamp === '' || strtotime($timestamp) === false) {
        throw new InvalidArgumentException('A timestamp is invalid.');
    }
    return $timestamp;
}

/** @return array<string,mixed> */
function taskAppValidateData(mixed $input): array
{
    if (!is_array($input) || (int) ($input['schemaVersion'] ?? 0) !== 1) {
        throw new InvalidArgumentException('Unsupported task data.');
    }
    $rawLists = $input['lists'] ?? null;
    $rawTasks = $input['tasks'] ?? null;
    if (!is_array($rawLists) || count($rawLists) < 1 || count($rawLists) > 100 || !is_array($rawTasks) || count($rawTasks) > 5000) {
        throw new InvalidArgumentException('Task data exceeds the supported bounds.');
    }
    $lists = [];
    $listIds = [];
    foreach ($rawLists as $list) {
        if (!is_array($list)) {
            throw new InvalidArgumentException('A list is invalid.');
        }
        $id = taskAppSafeId($list['id'] ?? null);
        if (isset($listIds[$id])) {
            throw new InvalidArgumentException('List IDs must be unique.');
        }
        $listIds[$id] = true;
        $lists[] = [
            'id' => $id,
            'name' => taskAppBoundedString($list['name'] ?? null, 80, true),
            'createdAt' => taskAppTimestamp($list['createdAt'] ?? null) ?? gmdate('c'),
        ];
    }
    $activeListId = taskAppSafeId($input['activeListId'] ?? null);
    if (!isset($listIds[$activeListId])) {
        throw new InvalidArgumentException('The active list does not exist.');
    }
    $tasks = [];
    $taskIds = [];
    foreach ($rawTasks as $task) {
        if (!is_array($task)) {
            throw new InvalidArgumentException('A task is invalid.');
        }
        $id = taskAppSafeId($task['id'] ?? null);
        $listId = taskAppSafeId($task['listId'] ?? null);
        if (isset($taskIds[$id]) || !isset($listIds[$listId])) {
            throw new InvalidArgumentException('A task ID or list reference is invalid.');
        }
        $taskIds[$id] = true;
        $completed = ($task['completed'] ?? false) === true;
        $createdAt = taskAppTimestamp($task['createdAt'] ?? null) ?? gmdate('c');
        $updatedAt = taskAppTimestamp($task['updatedAt'] ?? null) ?? $createdAt;
        $tasks[] = [
            'id' => $id,
            'listId' => $listId,
            'title' => taskAppBoundedString($task['title'] ?? null, 240, true),
            'notes' => taskAppBoundedString($task['notes'] ?? '', 2000),
            'completed' => $completed,
            'createdAt' => $createdAt,
            'updatedAt' => $updatedAt,
            'completedAt' => $completed ? (taskAppTimestamp($task['completedAt'] ?? null) ?? $updatedAt) : null,
        ];
    }
    return [
        'schemaVersion' => 1,
        'activeListId' => $activeListId,
        'lists' => $lists,
        'tasks' => $tasks,
    ];
}

function taskAppDataFile(): string
{
    $config = taskAppConfig();
    $path = (string) ($config['data_file'] ?? '');
    $directory = dirname($path);
    if ($path === '' || !is_dir($directory) || !is_writable($directory)) {
        throw new RuntimeException('The private task data directory is unavailable.');
    }
    $documentRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $resolvedDirectory = realpath($directory);
    if ($documentRoot !== false && $resolvedDirectory !== false) {
        $publicPrefix = rtrim($documentRoot, '/\\') . DIRECTORY_SEPARATOR;
        $privatePrefix = rtrim($resolvedDirectory, '/\\') . DIRECTORY_SEPARATOR;
        if (str_starts_with(strtolower($privatePrefix), strtolower($publicPrefix))) {
            throw new RuntimeException('Task data must be stored outside the public web directory.');
        }
    }
    return $path;
}

/** @return array{revision:int,updatedAt:string,data:array<string,mixed>} */
function taskAppReadDocumentFromPath(string $path): array
{
    if (!is_file($path)) {
        return ['revision' => 0, 'updatedAt' => gmdate('c'), 'data' => taskAppInitialData()];
    }
    $raw = file_get_contents($path);
    if (!is_string($raw) || strlen($raw) > TASK_APP_MAX_JSON_BYTES) {
        throw new RuntimeException('The task data file is unreadable or too large.');
    }
    $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($decoded) || !isset($decoded['data'])) {
        throw new RuntimeException('The task data file is malformed.');
    }
    return [
        'revision' => max(0, (int) ($decoded['revision'] ?? 0)),
        'updatedAt' => taskAppTimestamp($decoded['updatedAt'] ?? null) ?? gmdate('c'),
        'data' => taskAppValidateData($decoded['data']),
    ];
}

/** @return array{revision:int,updatedAt:string,data:array<string,mixed>} */
function taskAppReadDocument(): array
{
    $path = taskAppDataFile();
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_SH)) {
        throw new RuntimeException('Unable to lock the task data file.');
    }
    try {
        return taskAppReadDocumentFromPath($path);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/**
 * @param array<string,mixed> $data
 * @return array{conflict:bool,document:array{revision:int,updatedAt:string,data:array<string,mixed>}}
 */
function taskAppWriteDocument(int $baseRevision, array $data): array
{
    $validated = taskAppValidateData($data);
    $path = taskAppDataFile();
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        throw new RuntimeException('Unable to lock the task data file.');
    }
    try {
        $current = taskAppReadDocumentFromPath($path);
        if ($baseRevision !== $current['revision']) {
            return ['conflict' => true, 'document' => $current];
        }
        $document = [
            'revision' => $current['revision'] + 1,
            'updatedAt' => gmdate('c'),
            'data' => $validated,
        ];
        $encoded = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
        if (strlen($encoded) > TASK_APP_MAX_JSON_BYTES) {
            throw new InvalidArgumentException('Task data exceeds the storage limit.');
        }
        $temporary = $path . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
        $handle = fopen($temporary, 'xb');
        if ($handle === false) {
            throw new RuntimeException('Unable to create a temporary task data file.');
        }
        try {
            if (fwrite($handle, $encoded) !== strlen($encoded)) {
                throw new RuntimeException('Unable to write the complete task document.');
            }
            fflush($handle);
            if (function_exists('fsync')) {
                fsync($handle);
            }
        } finally {
            fclose($handle);
        }
        @chmod($temporary, 0600);
        if (is_file($path)) {
            @copy($path, $path . '.bak');
            @chmod($path . '.bak', 0600);
        }
        if (!@rename($temporary, $path)) {
            @unlink($temporary);
            throw new RuntimeException('Unable to replace the task data file.');
        }
        @chmod($path, 0600);
        return ['conflict' => false, 'document' => $document];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
