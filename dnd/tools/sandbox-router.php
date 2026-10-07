<?php
declare(strict_types=1);
// Used only by capture-sandbox.py serve, never uploaded as a production router.
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
    || !is_file(__DIR__ . '/.gmscreen-captured-sandbox')) { http_response_code(403); exit; }
if (!preg_match('/^(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$/iD', $_SERVER['HTTP_HOST'] ?? '')) { http_response_code(403); exit; }
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== 'http://' . $_SERVER['HTTP_HOST']) { http_response_code(403); exit; }
$settings = json_decode(file_get_contents(__DIR__ . '/sandbox-settings.json'), true, 512, JSON_THROW_ON_ERROR);
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com; worker-src 'self' blob:; form-action 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'");
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '');
if (!str_starts_with($path, '/dnd/') || str_contains($path, '\\') || str_contains($path, "\0") || preg_match('#(?:^|/)\.#', $path)
    || preg_match('#/(?:admin|tools|tests|backups|backup)/#i', $path)) { http_response_code(404); exit; }
$file = realpath(__DIR__ . $path);
if ($file && is_dir($file)) {
    if (!str_ends_with($path, '/')) { header('Location: ' . $path . '/'); exit; }
    $file = realpath($file . '/index.php');
}
$root = str_replace('\\', '/', __DIR__) . '/dnd/';
if (!$file || !str_starts_with(str_replace('\\', '/', $file), $root) || !is_file($file)) { http_response_code(404); exit; }
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if (in_array($ext, ['sqlite', 'sqlite3', 'db', 'ini', 'env'], true)) { http_response_code(403); exit; }
// Localize only the captured site's D&D URLs; stored snapshot bytes stay intact.
ob_start(static fn(string $body): string => str_replace([
    $settings['source_origin'] . '/dnd/',
    str_replace('/', '\\/', $settings['source_origin'] . '/dnd/'),
], ['/dnd/', '\\/dnd\\/'], $body));
if ($ext === 'php') {
    $_SERVER['SCRIPT_FILENAME'] = $file;
    $_SERVER['SCRIPT_NAME'] = $path;
    $_SERVER['PHP_SELF'] = $path;
    chdir(dirname($file));
    require $file;
} elseif (in_array($ext, ['js', 'mjs', 'css', 'json', 'html', 'svg'], true)) {
    $types = ['js'=>'text/javascript', 'mjs'=>'text/javascript', 'css'=>'text/css', 'json'=>'application/json', 'html'=>'text/html', 'svg'=>'image/svg+xml'];
    header('Content-Type: ' . $types[$ext]); readfile($file);
} else {
    ob_end_clean();
    return false;
}
return true;
