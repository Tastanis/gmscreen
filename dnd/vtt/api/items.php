<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET') {
    respondVttItemsJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
}

ensureVttSession();

$character = normalizeVttItemsCharacter($_GET['character'] ?? '');
if ($character === '') {
    respondVttItemsJson(400, [
        'success' => false,
        'error' => 'Invalid character.',
    ]);
}

$data = loadVttInventoryData();
$items = [];
$rawItems = $data[$character]['items'] ?? [];
if (is_array($rawItems)) {
    foreach ($rawItems as $item) {
        if (!is_array($item)) {
            continue;
        }
        if (array_key_exists('visible', $item) && $item['visible'] === false) {
            continue;
        }
        $name = trim((string)($item['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $items[] = [
            'id' => (string)($item['id'] ?? ''),
            'name' => $name,
        ];
    }
}

respondVttItemsJson(200, [
    'success' => true,
    'character' => $character,
    'items' => $items,
]);

function normalizeVttItemsCharacter($value): string
{
    $normalized = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($normalized, ['cal', 'sharon', 'indigo', 'zepha'], true) ? $normalized : '';
}

function loadVttInventoryData(): array
{
    $path = __DIR__ . '/../../data/inventory.json';
    if (!is_readable($path)) {
        return [];
    }

    $contents = file_get_contents($path);
    if ($contents === false || $contents === '') {
        return [];
    }

    $data = json_decode($contents, true);
    return is_array($data) ? $data : [];
}

function respondVttItemsJson(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}
