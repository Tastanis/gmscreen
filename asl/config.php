<?php
/**
 * ASL Hub — unified config (ASL 1/2/3).
 * Credentials live in config.local.php which is git-ignored.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}

$localConfig = __DIR__ . '/config.local.php';
if (!file_exists($localConfig)) {
    die('Missing asl/config.local.php — copy config.local.example.php and fill in database credentials.');
}
$creds = require $localConfig;

try {
    $port = $creds['port'] ?? 3306;
    $pdo = new PDO(
        "mysql:host={$creds['host']};port={$port};dbname={$creds['dbname']};charset=utf8mb4",
        $creds['user'],
        $creds['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    error_log('ASL Hub DB connection failed: ' . $e->getMessage());
    die('Database connection failed. Please tell your teacher.');
}

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/schema.php';

// Additive-only schema check (cheap; guarded by a settings flag once complete)
aslhub_ensure_schema($pdo);

// Keep PHP calendar math and MySQL NOW()/CURDATE() on the same school clock.
// MySQL installations do not always include named-zone tables, so use the
// current numeric offset while PHP retains the full IANA timezone for DST.
$schoolTimezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
if (!in_array($schoolTimezone, timezone_identifiers_list(), true)) $schoolTimezone = 'America/Los_Angeles';
date_default_timezone_set($schoolTimezone);
try {
    $offset = (new DateTimeImmutable('now', new DateTimeZone($schoolTimezone)))->format('P');
    $pdo->prepare('SET time_zone = ?')->execute([$offset]);
} catch (Throwable $e) {
    error_log('ASL Hub timezone alignment failed: ' . $e->getMessage());
}
