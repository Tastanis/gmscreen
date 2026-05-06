<?php
require_once __DIR__ . '/../auth.php';
buisness_require_login_api();

header('Content-Type: application/json');

$dataDir  = __DIR__ . '/../data';
$dataFile = $dataDir . '/selection.json';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

function clean_ids(array $input): array {
    $ids = [];
    $seen = [];
    foreach ($input as $id) {
        if (!is_string($id) || $id === '' || isset($seen[$id])) continue;
        $seen[$id] = true;
        $ids[] = $id;
    }
    return $ids;
}

function clean_presets(array $input): array {
    $presets = [];
    $seen = [];
    foreach ($input as $row) {
        if (!is_array($row)) continue;
        $key = '';
        if (isset($row['key'])) {
            $cleanKey = preg_replace('/[^a-z0-9_-]/i', '', (string)$row['key']);
            $key = $cleanKey === null ? '' : $cleanKey;
        }
        if ($key === '' || isset($seen[$key])) continue;
        $title = isset($row['title']) ? trim((string)$row['title']) : '';
        if ($title === '') $title = 'Preset';
        if (strlen($title) > 80) $title = substr($title, 0, 80);
        $ids = isset($row['ids']) && is_array($row['ids']) ? clean_ids($row['ids']) : [];
        $seen[$key] = true;
        $presets[] = ['key' => $key, 'title' => $title, 'ids' => $ids];
    }
    return $presets;
}

function is_list_array(array $data): bool {
    $expected = 0;
    foreach ($data as $key => $_) {
        if ($key !== $expected) return false;
        $expected++;
    }
    return true;
}

function read_selection_data(string $file): array {
    if (!file_exists($file)) return ['ids' => [], 'presets' => []];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return ['ids' => [], 'presets' => []];
    $data = json_decode($raw, true);
    if (!is_array($data)) return ['ids' => [], 'presets' => []];

    // Backward compatibility: older selection.json files were a bare ID array.
    if (is_list_array($data)) {
        return ['ids' => clean_ids($data), 'presets' => []];
    }

    return [
        'ids' => isset($data['ids']) && is_array($data['ids']) ? clean_ids($data['ids']) : [],
        'presets' => isset($data['presets']) && is_array($data['presets']) ? clean_presets($data['presets']) : [],
    ];
}

function write_selection_data(string $file, array $ids, array $presets): bool {
    $tmp = $file . '.tmp';
    $fh = @fopen($tmp, 'w');
    if (!$fh) return false;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return false; }
    fwrite($fh, json_encode([
        'ids' => array_values($ids),
        'presets' => array_values($presets),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return @rename($tmp, $file);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $data = read_selection_data($dataFile);
    echo json_encode(['ok' => true, 'ids' => $data['ids'], 'presets' => $data['presets']]);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['ids']) || !is_array($body['ids'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_payload']);
        exit;
    }
    $ids = clean_ids($body['ids']);
    $presets = isset($body['presets']) && is_array($body['presets']) ? clean_presets($body['presets']) : [];
    if (!write_selection_data($dataFile, $ids, $presets)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed']);
        exit;
    }
    echo json_encode(['ok' => true, 'count' => count($ids)]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
