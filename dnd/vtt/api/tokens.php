<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET') {
        respondJson(200, [
            'success' => true,
            'data' => loadTokensPayload(),
        ]);
    }

    if ($method === 'POST') {
        $payload = readJsonInput();
        $action = $payload['action'] ?? 'create-token';

        if ($action === 'create-folder') {
            $folder = createTokenFolder($payload);
            respondJson(200, [
                'success' => true,
                'data' => $folder,
            ]);
        }

        if ($action === 'create-token') {
            $token = createToken($payload);
            respondJson(200, [
                'success' => true,
                'data' => $token,
            ]);
        }

        respondJson(400, [
            'success' => false,
            'error' => 'Unsupported action.',
        ]);
    }

    respondJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] Token API error: ' . $exception->getMessage());
    respondJson(500, [
        'success' => false,
        'error' => 'Unexpected server error.',
    ]);
}

function readJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function loadTokensPayload(): array
{
    $data = loadVttJson('tokens.json');
    if (!is_array($data)) {
        return ['folders' => [], 'items' => []];
    }

    if (array_values($data) === $data) {
        return [
            'folders' => [],
            'items' => normalizeCollection($data),
        ];
    }

    return [
        'folders' => normalizeCollection($data['folders'] ?? []),
        'items' => normalizeCollection($data['tokens'] ?? $data['items'] ?? []),
    ];
}

function createTokenFolder(array $payload): array
{
    $name = trim((string) ($payload['name'] ?? ''));
    if ($name === '') {
        respondJson(422, [
            'success' => false,
            'error' => 'Folder name cannot be empty.',
        ]);
    }

    $storage = loadTokensPayload();

    $folder = [
        'id' => generateId('tfd'),
        'name' => truncateString($name, 120),
        'createdAt' => date(DATE_ATOM),
    ];

    $storage['folders'][] = $folder;
    persistTokens($storage);

    return $folder;
}

function createToken(array $payload): array
{
    $imageData = trim((string) ($payload['imageData'] ?? ''));
    if ($imageData === '') {
        respondJson(422, [
            'success' => false,
            'error' => 'A token image is required.',
        ]);
    }

    $decoded = decodeTokenImage($imageData);
    if ($decoded === null) {
        respondJson(422, [
            'success' => false,
            'error' => 'Token image data is invalid or unsupported.',
        ]);
    }

    if (strlen($decoded['data']) > 5 * 1024 * 1024) {
        respondJson(413, [
            'success' => false,
            'error' => 'Token images must be smaller than 5 MB.',
        ]);
    }

    $imageInfo = @getimagesizefromstring($decoded['data']);
    if ($imageInfo === false) {
        respondJson(415, [
            'success' => false,
            'error' => 'Token image could not be processed.',
        ]);
    }

    $storage = loadTokensPayload();
    $folderId = isset($payload['folderId']) ? trim((string) $payload['folderId']) : '';
    $folderId = $folderId !== '' ? $folderId : null;

    $folder = null;
    if ($folderId !== null) {
        foreach ($storage['folders'] as $existing) {
            if (($existing['id'] ?? null) === $folderId) {
                $folder = $existing;
                break;
            }
        }

        if ($folder === null) {
            respondJson(422, [
                'success' => false,
                'error' => 'Selected folder does not exist.',
            ]);
        }
    }

    $tokenId = generateId('tok');
    $filename = $tokenId . '.' . $decoded['extension'];
    $destinationDir = __DIR__ . '/../storage/tokens';

    if (!is_dir($destinationDir) && !mkdir($destinationDir, 0775, true) && !is_dir($destinationDir)) {
        respondJson(500, [
            'success' => false,
            'error' => 'Unable to prepare storage for token images.',
        ]);
    }

    $filePath = $destinationDir . '/' . $filename;
    if (file_put_contents($filePath, $decoded['data']) === false) {
        respondJson(500, [
            'success' => false,
            'error' => 'Failed to save the token image.',
        ]);
    }

    $token = [
        'id' => $tokenId,
        'name' => truncateString(trim((string) ($payload['name'] ?? '')), 160) ?: 'Untitled Token',
        'folderId' => $folderId,
        'imageUrl' => '/dnd/vtt/storage/tokens/' . $filename,
        'createdAt' => date(DATE_ATOM),
    ];

    $storage['items'][] = $token;
    persistTokens($storage);

    if ($folder !== null) {
        $token['folder'] = $folder;
    }

    return $token;
}

function decodeTokenImage(string $dataUrl): ?array
{
    if (!preg_match('/^data:image\/(png|jpg|jpeg|webp);base64,/i', $dataUrl, $matches)) {
        return null;
    }

    $encoded = substr($dataUrl, strpos($dataUrl, ',') + 1);
    $binary = base64_decode($encoded, true);
    if ($binary === false || $binary === '') {
        return null;
    }

    $format = strtolower($matches[1]);
    $extension = $format === 'jpeg' ? 'jpg' : $format;

    return [
        'data' => $binary,
        'extension' => $extension,
    ];
}

function persistTokens(array $storage): void
{
    $payload = [
        'folders' => normalizeCollection($storage['folders'] ?? []),
        'tokens' => normalizeCollection($storage['items'] ?? []),
    ];

    if (!saveVttJson('tokens.json', $payload)) {
        respondJson(500, [
            'success' => false,
            'error' => 'Failed to save tokens.',
        ]);
    }
}

function normalizeCollection($collection): array
{
    if (!is_array($collection)) {
        return [];
    }

    return array_values(array_filter(
        $collection,
        static fn ($item) => is_array($item) && isset($item['id'])
    ));
}

function generateId(string $prefix): string
{
    try {
        $random = bin2hex(random_bytes(6));
    } catch (Exception $exception) {
        $random = uniqid();
    }

    return $prefix . '_' . $random;
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function truncateString(string $value, int $length): string
{
    if ($length <= 0) {
        return '';
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $length);
    }

    return substr($value, 0, $length);
}
