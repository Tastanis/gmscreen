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
            'description' => (string)($item['description'] ?? ''),
            'keywords' => (string)($item['keywords'] ?? ''),
            'effect' => (string)($item['effect'] ?? ''),
            'effectSections' => normalizeVttItemEffectSections($item['effectSections'] ?? []),
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
    // Items now come from the character sheet inventory rather than the
    // legacy dashboard inventory (dnd/data/inventory.json).
    $path = __DIR__ . '/../../data/character_inventory.json';
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

function normalizeVttItemEffectSections($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $sections = [];
    foreach ($value as $section) {
        if (!is_array($section)) {
            continue;
        }
        $title = trim((string)($section['title'] ?? ''));
        $cost = trim((string)($section['cost'] ?? ''));
        $text = trim((string)($section['text'] ?? ''));
        if ($title === '' && $cost === '' && $text === '') {
            continue;
        }
        $sections[] = [
            'title' => $title,
            'cost' => $cost,
            'text' => $text,
        ];
    }

    return $sections;
}

function respondVttItemsJson(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}
