<?php
require_once __DIR__ . '/../auth.php';
buisness_require_login_api();

header('Content-Type: application/json');

$dataDir  = __DIR__ . '/../data';
$dataFile = $dataDir . '/bullets.json';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

function read_bullets(string $file): array {
    if (!file_exists($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function write_bullets(string $file, array $bullets): bool {
    $tmp = $file . '.tmp';
    $fh = @fopen($tmp, 'w');
    if (!$fh) return false;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return false; }
    fwrite($fh, json_encode($bullets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return @rename($tmp, $file);
}

function sanitize_html_fragment(string $html): string {
    if (strlen($html) > 300000) {
        $html = substr($html, 0, 300000);
    }

    $clean = preg_replace('#<\s*(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)\b[^>]*>.*?<\s*/\s*\1\s*>#is', '', $html);
    if ($clean === null) $clean = $html;
    $clean = preg_replace('#<\s*(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)\b[^>]*\/?\s*>#is', '', $clean);
    if ($clean === null) $clean = $html;
    $clean = preg_replace('/\son[a-z]+\s*=\s*(".*?"|\'.*?\'|[^\s>]+)/is', '', $clean);
    if ($clean === null) $clean = $html;
    $clean = preg_replace('/\s(?:href|src)\s*=\s*([\'"])\s*javascript:.*?\1/is', '', $clean);
    if ($clean === null) $clean = $html;

    return trim($clean);
}

function sanitize_bullets(array $input): array {
    $out = [];
    $seen = [];
    foreach ($input as $row) {
        if (!is_array($row)) continue;
        $id    = isset($row['id'])    ? (string)$row['id']    : '';
        $depth = isset($row['depth']) ? (int)$row['depth']    : 0;
        $text  = isset($row['text'])  ? (string)$row['text']  : '';
        $questionsHtml = isset($row['questionsHtml']) ? sanitize_html_fragment((string)$row['questionsHtml']) : '';
        $draftHtml     = isset($row['draftHtml'])     ? sanitize_html_fragment((string)$row['draftHtml'])     : '';
        $batchWithParent = !empty($row['batchWithParent']);
        if ($id === '' || isset($seen[$id])) continue;
        if ($depth < 0) $depth = 0;
        if ($depth > 2) $depth = 2;
        if ($depth === 0) $batchWithParent = false;
        // Cap text length to a sane limit.
        if (strlen($text) > 2000) $text = substr($text, 0, 2000);
        $seen[$id] = true;
        $out[] = [
            'id' => $id,
            'depth' => $depth,
            'text' => $text,
            'questionsHtml' => $questionsHtml,
            'draftHtml' => $draftHtml,
            'batchWithParent' => $batchWithParent,
        ];
    }
    return $out;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo json_encode(['ok' => true, 'bullets' => read_bullets($dataFile)]);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['bullets']) || !is_array($body['bullets'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_payload']);
        exit;
    }
    $clean = sanitize_bullets($body['bullets']);
    if (!write_bullets($dataFile, $clean)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed']);
        exit;
    }
    echo json_encode(['ok' => true, 'count' => count($clean)]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
