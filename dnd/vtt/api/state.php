<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    if ($method === 'GET') {
        $config = getVttBootstrapConfig();
        respondJson(200, [
            'success' => true,
            'data' => [
                'scenes' => $config['scenes'],
                'tokens' => $config['tokens'],
                'boardState' => $config['boardState'],
            ],
        ]);
    }

    if ($method === 'POST') {
        $auth = getVttUserContext();
        if (!($auth['isLoggedIn'] ?? false)) {
            respondJson(401, [
                'success' => false,
                'error' => 'Authentication required.',
            ]);
        }

        if (!($auth['isGM'] ?? false)) {
            respondJson(403, [
                'success' => false,
                'error' => 'Only the GM can update the board state.',
            ]);
        }

        $payload = readJsonInput();
        $rawState = [];
        if (isset($payload['boardState']) && is_array($payload['boardState'])) {
            $rawState = $payload['boardState'];
        } elseif (is_array($payload)) {
            $rawState = $payload;
        }

        $updates = sanitizeBoardStateUpdates($rawState);
        if (empty($updates)) {
            respondJson(422, [
                'success' => false,
                'error' => 'No board state changes were provided.',
            ]);
        }

        $existing = loadVttJson('board-state.json');
        $nextState = normalizeBoardState($existing);

        foreach ($updates as $key => $value) {
            $nextState[$key] = $value;
        }

        if (!saveVttJson('board-state.json', $nextState)) {
            respondJson(500, [
                'success' => false,
                'error' => 'Failed to persist board state.',
            ]);
        }

        respondJson(200, [
            'success' => true,
            'data' => $nextState,
        ]);
    }

    respondJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (InvalidArgumentException $exception) {
    respondJson(422, [
        'success' => false,
        'error' => $exception->getMessage() ?: 'Invalid board state payload.',
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] State API error: ' . $exception->getMessage());
    respondJson(500, [
        'success' => false,
        'error' => 'Failed to process board state.',
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

/**
 * @param array<string,mixed> $raw
 * @return array<string,mixed>
 */
function sanitizeBoardStateUpdates(array $raw): array
{
    $updates = [];

    if (array_key_exists('activeSceneId', $raw)) {
        $rawId = $raw['activeSceneId'];
        if ($rawId === null) {
            $updates['activeSceneId'] = null;
        } elseif (is_string($rawId)) {
            $trimmed = trim($rawId);
            $updates['activeSceneId'] = $trimmed === '' ? null : $trimmed;
        } else {
            throw new InvalidArgumentException('Active scene id must be a string or null.');
        }
    }

    if (array_key_exists('mapUrl', $raw)) {
        $rawUrl = $raw['mapUrl'];
        if ($rawUrl === null) {
            $updates['mapUrl'] = null;
        } elseif (is_string($rawUrl)) {
            $trimmed = trim($rawUrl);
            $updates['mapUrl'] = $trimmed === '' ? null : $trimmed;
        } else {
            throw new InvalidArgumentException('Map URL must be a string or null.');
        }
    }

    if (array_key_exists('placements', $raw)) {
        $rawPlacements = $raw['placements'];
        if ($rawPlacements === null) {
            $updates['placements'] = [];
        } elseif (is_array($rawPlacements)) {
            $updates['placements'] = normalizePlacementsPayload($rawPlacements);
        } else {
            throw new InvalidArgumentException('Placements must be an array or object.');
        }
    }

    return $updates;
}

/**
 * @param mixed $raw
 * @return array{activeSceneId: ?string, mapUrl: ?string, placements: array}
 */
function normalizeBoardState($raw): array
{
    $state = [
        'activeSceneId' => null,
        'mapUrl' => null,
        'placements' => [],
    ];

    if (!is_array($raw)) {
        return $state;
    }

    if (array_key_exists('activeSceneId', $raw)) {
        $value = $raw['activeSceneId'];
        if (is_string($value)) {
            $value = trim($value);
            $state['activeSceneId'] = $value === '' ? null : $value;
        } elseif ($value === null) {
            $state['activeSceneId'] = null;
        }
    }

    if (array_key_exists('mapUrl', $raw)) {
        $value = $raw['mapUrl'];
        if (is_string($value)) {
            $value = trim($value);
            $state['mapUrl'] = $value === '' ? null : $value;
        } elseif ($value === null) {
            $state['mapUrl'] = null;
        }
    }

    if (array_key_exists('placements', $raw) && is_array($raw['placements'])) {
        $state['placements'] = normalizePlacementsPayload($raw['placements']);
    }

    return $state;
}

/**
 * @param array<string|int,mixed> $rawPlacements
 * @return array<string,array<int,array<string,mixed>>>
 */
function normalizePlacementsPayload(array $rawPlacements): array
{
    $normalized = [];
    foreach ($rawPlacements as $sceneId => $placements) {
        if (!is_array($placements)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $normalized[$key] = array_values(array_filter($placements, 'is_array'));
    }

    return $normalized;
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}
