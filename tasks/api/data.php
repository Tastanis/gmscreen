<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/storage.php';

try {
    taskAppRequireAuthenticatedJson();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        $document = taskAppReadDocument();
        taskAppJsonResponse(200, ['ok' => true] + $document + ['csrfToken' => taskAppCsrfToken()]);
    }
    if ($method !== 'PUT') {
        header('Allow: GET, PUT');
        taskAppJsonResponse(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    if (!taskAppCsrfIsValid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        taskAppJsonResponse(403, ['ok' => false, 'error' => 'Invalid request token.']);
    }
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength < 1 || $contentLength > TASK_APP_MAX_JSON_BYTES) {
        taskAppJsonResponse(413, ['ok' => false, 'error' => 'Task data is empty or too large.']);
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > TASK_APP_MAX_JSON_BYTES) {
        taskAppJsonResponse(413, ['ok' => false, 'error' => 'Task data is empty or too large.']);
    }
    $payload = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($payload) || !is_int($payload['baseRevision'] ?? null) || !is_array($payload['data'] ?? null)) {
        taskAppJsonResponse(422, ['ok' => false, 'error' => 'The save request is invalid.']);
    }
    $result = taskAppWriteDocument($payload['baseRevision'], $payload['data']);
    if ($result['conflict']) {
        taskAppJsonResponse(409, [
            'ok' => false,
            'error' => 'Tasks changed on another device.',
            'conflict' => true,
        ] + $result['document']);
    }
    taskAppJsonResponse(200, ['ok' => true] + $result['document'] + ['csrfToken' => taskAppCsrfToken()]);
} catch (InvalidArgumentException | JsonException $error) {
    taskAppJsonResponse(422, ['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('[My Tasks] ' . $error->getMessage());
    taskAppJsonResponse(500, ['ok' => false, 'error' => 'The task service could not complete the request.']);
}
