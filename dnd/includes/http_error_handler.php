<?php

declare(strict_types=1);

final class VttHttpErrorHandler
{
    private const FORMAT_JSON = 'json';
    private const FORMAT_HTML = 'html';

    private static ?self $instance = null;

    /** @var string */
    private $format;

    /** @var string */
    private $logFile;

    /** @var bool */
    private $responseEmitted = false;

    private function __construct(string $format, string $logFile)
    {
        $this->format = $format;
        $this->logFile = $logFile;
    }

    public static function register(string $format = self::FORMAT_JSON, ?string $logFile = null): void
    {
        if ($logFile === null) {
            $logFile = __DIR__ . '/../logs/vtt_error.log';
        }

        $directory = dirname($logFile);
        if (!is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        error_reporting(E_ALL);
        ini_set('display_errors', '0');
        ini_set('log_errors', '1');

        self::$instance = new self($format, $logFile);

        set_error_handler([self::$instance, 'handleError']);
        set_exception_handler([self::$instance, 'handleException']);
        register_shutdown_function([self::$instance, 'handleShutdown']);
    }

    public static function registerJson(?string $logFile = null): void
    {
        self::register(self::FORMAT_JSON, $logFile);
    }

    public static function registerHtml(?string $logFile = null): void
    {
        self::register(self::FORMAT_HTML, $logFile);
    }

    public function handleError(int $severity, string $message, string $file, int $line): bool
    {
        if (!(error_reporting() & $severity)) {
            return false;
        }

        $this->handleException(new \ErrorException($message, 0, $severity, $file, $line));
        return true;
    }

    public function handleException(\Throwable $throwable): void
    {
        $this->logThrowable($throwable);
        $this->emitErrorResponse($throwable);
        exit(1);
    }

    public function handleShutdown(): void
    {
        $error = error_get_last();
        if ($error === null) {
            return;
        }

        if (!$this->isFatalErrorType($error['type'] ?? 0)) {
            return;
        }

        $throwable = new \ErrorException(
            (string) ($error['message'] ?? 'Fatal error'),
            0,
            (int) ($error['type'] ?? E_ERROR),
            (string) ($error['file'] ?? 'unknown'),
            (int) ($error['line'] ?? 0)
        );

        $this->logThrowable($throwable);
        $this->emitErrorResponse($throwable);
    }

    private function emitErrorResponse(\Throwable $throwable): void
    {
        if ($this->responseEmitted) {
            return;
        }
        $this->responseEmitted = true;

        $statusCode = $this->determineStatusCode($throwable);
        if (!headers_sent()) {
            http_response_code($statusCode);
        }

        if ($this->format === self::FORMAT_JSON) {
            $this->emitJsonError($throwable);
            return;
        }

        $this->emitHtmlError($throwable, $statusCode);
    }

    private function emitJsonError(\Throwable $throwable): void
    {
        $payload = [
            'success' => false,
            'error' => [
                'message' => $throwable->getMessage(),
                'type' => get_class($throwable),
                'file' => $this->normalizePath($throwable->getFile()),
                'line' => $throwable->getLine(),
            ],
        ];

        if (!headers_sent()) {
            header('Content-Type: application/json');
        }

        echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }

    private function emitHtmlError(\Throwable $throwable, int $statusCode): void
    {
        if (!headers_sent()) {
            header('Content-Type: text/html; charset=UTF-8');
        }

        $title = 'Application Error';
        $message = htmlspecialchars($throwable->getMessage(), ENT_QUOTES, 'UTF-8');
        $type = htmlspecialchars(get_class($throwable), ENT_QUOTES, 'UTF-8');
        $file = htmlspecialchars($this->normalizePath($throwable->getFile()), ENT_QUOTES, 'UTF-8');
        $line = $throwable->getLine();

        echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{$title}</title>
    <style>
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; background: #0f172a; color: #e2e8f0; }
        .error-card { max-width: 720px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.75); }
        h1 { font-size: 1.75rem; margin-bottom: 1rem; color: #38bdf8; }
        .error-meta { font-size: 0.95rem; margin-bottom: 1rem; color: #94a3b8; }
        code { font-family: 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; background: rgba(15, 23, 42, 0.75); padding: 0.25rem 0.5rem; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="error-card">
        <h1>Something went wrong (HTTP {$statusCode})</h1>
        <p class="error-meta">{$type} thrown in <code>{$file}:{$line}</code></p>
        <p>{$message}</p>
        <p>Please share this message with the developer for further assistance.</p>
    </div>
</body>
</html>
HTML;
    }

    private function logThrowable(\Throwable $throwable): void
    {
        $logEntry = sprintf(
            "[%s] %s: %s in %s:%d\nStack trace:\n%s\n\n",
            date('c'),
            get_class($throwable),
            $throwable->getMessage(),
            $throwable->getFile(),
            $throwable->getLine(),
            $throwable->getTraceAsString()
        );

        file_put_contents($this->logFile, $logEntry, FILE_APPEND);
    }

    private function determineStatusCode(\Throwable $throwable): int
    {
        if ($throwable instanceof \ErrorException) {
            return 500;
        }

        $code = (int) $throwable->getCode();
        if ($code >= 400 && $code < 600) {
            return $code;
        }

        return 500;
    }

    private function isFatalErrorType(int $type): bool
    {
        return in_array($type, [
            E_ERROR,
            E_PARSE,
            E_CORE_ERROR,
            E_CORE_WARNING,
            E_COMPILE_ERROR,
            E_COMPILE_WARNING,
            E_USER_ERROR,
        ], true);
    }

    private function normalizePath(string $path): string
    {
        $root = realpath(__DIR__ . '/..');
        if ($root && strpos($path, $root) === 0) {
            $relative = substr($path, strlen($root));
            return ltrim(str_replace('\\', '/', $relative), '/');
        }

        return str_replace('\\', '/', $path);
    }
}
