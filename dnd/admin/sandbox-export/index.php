<?php
declare(strict_types=1);
require_once __DIR__ . '/lib.php';
ini_set('display_errors', '0');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function captureError(int $status, string $message): never {
    http_response_code($status); header('Content-Type: application/json');
    echo sandboxJson(['error'=>$message]); exit;
}

// This file is OUTSIDE public_html. Uploading the endpoint alone grants no access.
$private = dirname(__DIR__, 4) . '/dnd-sandbox-export.php';
if (!is_file($private) || is_link($private)) captureError(503, 'Capture is not configured.');
try { $config = require $private; } catch (Throwable $e) { captureError(503, 'Capture configuration failed.'); }
if (!is_array($config)) captureError(503, 'Capture is not configured.');
$loopback = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (($_SERVER['HTTPS'] ?? '') !== 'on' && !(($config['allow_loopback_http'] ?? false) === true && $loopback)) captureError(403, 'HTTPS required.');
// Read-only on the host whatever the method. POST carries the list of paths for action=checksums and nothing else.
$method = $_SERVER['REQUEST_METHOD'] ?? '';
$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : 'manifest';
if ($method !== 'GET' && !($method === 'POST' && $action === 'checksums')) captureError(405, $action === 'checksums' ? 'POST required.' : 'GET required.');
if ($action === 'checksums' && $method !== 'POST') captureError(405, 'POST required.');
$token = $_SERVER['HTTP_X_DND_CAPTURE_TOKEN'] ?? '';
$expected = $config['token_sha256'] ?? '';
if (!is_string($expected) || !preg_match('/^[a-f0-9]{64}$/D', $expected) || strlen($token) < 32 || !hash_equals($expected, hash('sha256', $token))) captureError(403, 'Access denied.');

try {
    $roots = sandboxRoots(dirname(__DIR__, 2), $config);
    if ($action === 'manifest') {
        // checksums=0: the quick list, with sizes and times and nothing read.
        $quick = ($_GET['checksums'] ?? '1') === '0';
        header('Content-Type: application/json'); echo sandboxJson(sandboxManifest($roots, $config, !$quick)); exit;
    }
    if ($action === 'checksums') {
        $raw = file_get_contents('php://input', false, null, 0, 262145);
        $body = is_string($raw) && strlen($raw) <= 262144 ? json_decode($raw, true) : null;
        if (!is_array($body) || !is_array($body['paths'] ?? null) || !array_is_list($body['paths'])) captureError(400, 'A JSON body with a list of paths is required.');
        foreach ($body['paths'] as $named) {
            try { if (!is_string($named)) throw new RuntimeException('Invalid path.'); sandboxPath($named); } catch (Throwable $e) { captureError(400, 'Invalid path in the list.'); }
        }
        try { $answer = sandboxChecksums($roots, $body['paths']); } catch (SandboxTooMuch $e) { captureError(413, $e->getMessage()); }
        header('Content-Type: application/json'); echo sandboxJson($answer); exit;
    }
    if ($action !== 'file') captureError(400, 'Unknown action.');
    $path = sandboxPath((string)($_GET['path'] ?? ''));
    $entry = sandboxResolve($roots, $path);
    // Never return source code or configuration, even with a valid token.
    if (!$entry || $entry['kind'] === 'code') captureError(404, 'File is not exportable.');
    $wanted = (string)($_GET['sha256'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/D', $wanted)) captureError(400, 'Expected hash required.');
    $source = $entry['kind'] === 'sqlite' ? sandboxSqliteCopy($entry['absolute']) : $entry['absolute'];
    try {
        if (!hash_equals($wanted, (string)hash_file('sha256', $source))) {
            if ($entry['kind'] === 'sqlite') @unlink($source);
            captureError(409, 'File changed; start a new capture.');
        }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($source));
        header('ETag: "' . $wanted . '"');
        readfile($source);
    } finally { if ($entry['kind'] === 'sqlite') @unlink($source); }
} catch (Throwable $e) {
    // Never leak paths, credentials, or PHP/SQL details through an error response.
    captureError(500, 'Capture failed. Check server configuration and PHP extensions.');
}
