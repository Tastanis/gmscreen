<?php
require_once __DIR__ . '/../auth.php';
buisness_require_login_api();

header('Content-Type: application/json');

$dataDir  = __DIR__ . '/../data';
$dataFile = $dataDir . '/selection.json';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

function read_selection(string $file): array {
    if (!file_exists($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? array_values(array_filter($data, 'is_string')) : [];
}

function write_selection(string $file, array $ids): bool {
    $tmp = $file . '.tmp';
    $fh = @fopen($tmp, 'w');
    if (!$fh) return false;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return false; }
    fwrite($fh, json_encode(array_values($ids), JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return @rename($tmp, $file);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo json_encode(['ok' => true, 'ids' => read_selection($dataFile)]);
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
    $ids = [];
    $seen = [];
    foreach ($body['ids'] as $id) {
        if (!is_string($id) || $id === '' || isset($seen[$id])) continue;
        $seen[$id] = true;
        $ids[] = $id;
    }
    if (!write_selection($dataFile, $ids)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed']);
        exit;
    }
    echo json_encode(['ok' => true, 'count' => count($ids)]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
