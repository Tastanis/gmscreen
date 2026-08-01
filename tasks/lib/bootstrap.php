<?php
declare(strict_types=1);

const TASK_APP_MAX_JSON_BYTES = 524288;

function taskAppStartSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('MYTASKSSID');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => '/tasks/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** @return array<string,mixed> */
function taskAppConfig(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }
    $configuredPath = getenv('TASKS_CONFIG_FILE');
    $documentRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $defaultPath = $documentRoot !== ''
        ? dirname($documentRoot) . DIRECTORY_SEPARATOR . 'task-app-private' . DIRECTORY_SEPARATOR . 'config.php'
        : '';
    $path = is_string($configuredPath) && trim($configuredPath) !== ''
        ? trim($configuredPath)
        : $defaultPath;
    $loaded = $path !== '' && is_file($path) ? require $path : [];
    $loaded = is_array($loaded) ? $loaded : [];
    $privateDir = $path !== '' ? dirname($path) : '';
    $dataFile = trim((string) ($loaded['data_file'] ?? ''));
    if ($dataFile === '' && $privateDir !== '') {
        $dataFile = $privateDir . DIRECTORY_SEPARATOR . 'tasks.json';
    }
    $config = [
        'config_file' => $path,
        'password_hash' => trim((string) ($loaded['password_hash'] ?? '')),
        'data_file' => $dataFile,
    ];
    return $config;
}

function taskAppIsConfigured(): bool
{
    $config = taskAppConfig();
    $configDirectory = realpath(dirname((string) $config['config_file']));
    $documentRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $outsidePublicRoot = $configDirectory !== false;
    if ($outsidePublicRoot && $documentRoot !== false) {
        $outsidePublicRoot = !str_starts_with(
            strtolower(rtrim($configDirectory, '/\\') . DIRECTORY_SEPARATOR),
            strtolower(rtrim($documentRoot, '/\\') . DIRECTORY_SEPARATOR)
        );
    }
    return $outsidePublicRoot
        && $config['password_hash'] !== ''
        && password_get_info($config['password_hash'])['algo'] !== null
        && $config['data_file'] !== '';
}

function taskAppIsAuthenticated(): bool
{
    taskAppStartSession();
    return ($_SESSION['task_app_authenticated'] ?? false) === true;
}

function taskAppCsrfToken(): string
{
    taskAppStartSession();
    if (!is_string($_SESSION['task_app_csrf'] ?? null) || strlen($_SESSION['task_app_csrf']) < 32) {
        $_SESSION['task_app_csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['task_app_csrf'];
}

function taskAppCsrfIsValid(?string $token): bool
{
    return is_string($token) && $token !== '' && hash_equals(taskAppCsrfToken(), $token);
}

/** @param array<string,mixed> $payload */
function taskAppJsonResponse(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function taskAppRequireAuthenticatedJson(): void
{
    if (!taskAppIsConfigured()) {
        taskAppJsonResponse(503, ['ok' => false, 'error' => 'Task sync is not configured.']);
    }
    if (!taskAppIsAuthenticated()) {
        taskAppJsonResponse(401, ['ok' => false, 'error' => 'Authentication required.']);
    }
}
