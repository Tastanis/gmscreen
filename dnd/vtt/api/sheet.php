<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method !== 'POST' && $method !== 'GET') {
    respondJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
}

if ($method === 'POST') {
    $payload = readJsonInput();

    if (!is_array($_POST)) {
        $_POST = [];
    }

    if (!empty($payload)) {
        $_POST = array_merge($_POST, $payload);
    }

    if (!isset($_POST['action']) || $_POST['action'] === '') {
        $_POST['action'] = 'sync-stamina';
    }
}

require_once __DIR__ . '/../../character_sheet/handler.php';

function readJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}
