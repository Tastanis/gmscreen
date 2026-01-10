<?php
/**
 * Ping API Endpoints
 * RESTful API for map ping operations (cross-user pings)
 */

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Check authentication
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$user = $_SESSION['user'] ?? 'unknown';
$sessionId = session_id();

// Ping storage file path
$pingDataFile = __DIR__ . '/../data/pings.json';

// Ensure data directory exists
$dataDir = dirname($pingDataFile);
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Constants
define('PING_RETENTION_MS', 10000);     // Pings live for 10 seconds
define('MAX_STORED_PINGS', 16);         // Max pings to store

// Error handling function
function sendError($code, $message, $details = null) {
    http_response_code($code);
    $response = ['error' => $message];
    if ($details) {
        $response['details'] = $details;
    }
    echo json_encode($response);
    exit;
}

// Success response function
function sendSuccess($data = null, $message = null) {
    $response = ['success' => true];
    if ($message) {
        $response['message'] = $message;
    }
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response);
    exit;
}

// Load pings from file
function loadPings($pingDataFile) {
    if (!file_exists($pingDataFile)) {
        return [];
    }

    $content = file_get_contents($pingDataFile);
    if (empty($content)) {
        return [];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [];
    }

    return $data;
}

// Save pings to file
function savePings($pingDataFile, $pings) {
    $json = json_encode($pings, JSON_PRETTY_PRINT);
    file_put_contents($pingDataFile, $json, LOCK_EX);
}

// Clean expired pings
function cleanExpiredPings($pings) {
    $now = round(microtime(true) * 1000); // Current time in ms
    $threshold = $now - PING_RETENTION_MS;

    return array_values(array_filter($pings, function($ping) use ($threshold) {
        $createdAt = $ping['createdAt'] ?? 0;
        return $createdAt >= $threshold;
    }));
}

try {
    switch ($method) {
        case 'GET':
            handleGetRequest();
            break;
        case 'POST':
            handlePostRequest();
            break;
        default:
            sendError(405, 'Method not allowed');
    }
} catch (Exception $e) {
    error_log("Ping API error: " . $e->getMessage());
    sendError(500, 'Internal server error', $e->getMessage());
}

function handleGetRequest() {
    global $pingDataFile;

    $action = $_GET['action'] ?? 'get_pings';

    switch ($action) {
        case 'get_pings':
            // Load and clean pings
            $pings = loadPings($pingDataFile);
            $pings = cleanExpiredPings($pings);

            // Save cleaned pings back (remove expired)
            savePings($pingDataFile, $pings);

            sendSuccess([
                'pings' => $pings,
                'serverTime' => round(microtime(true) * 1000)
            ]);
            break;

        default:
            sendError(400, 'Invalid action');
    }
}

function handlePostRequest() {
    global $pingDataFile, $user, $sessionId;

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $action = $input['action'] ?? '';

    switch ($action) {
        case 'add_ping':
            // Validate ping data
            if (!isset($input['x']) || !isset($input['y'])) {
                sendError(400, 'X and Y coordinates required');
            }

            $x = floatval($input['x']);
            $y = floatval($input['y']);
            $type = ($input['type'] ?? 'ping') === 'focus' ? 'focus' : 'ping';

            // Normalize coordinates to 0-1 range
            $x = max(0, min(1, $x));
            $y = max(0, min(1, $y));

            // Generate unique ping ID
            $now = round(microtime(true) * 1000);
            $randomSuffix = substr(md5(mt_rand()), 0, 8);
            $pingId = "{$user}:{$now}:{$randomSuffix}";

            // Create ping entry
            $pingEntry = [
                'id' => $pingId,
                'x' => $x,
                'y' => $y,
                'type' => $type,
                'createdAt' => $now,
                'authorId' => $user
            ];

            // Load existing pings
            $pings = loadPings($pingDataFile);

            // Clean expired pings
            $pings = cleanExpiredPings($pings);

            // Add new ping
            $pings[] = $pingEntry;

            // Limit to max stored pings
            if (count($pings) > MAX_STORED_PINGS) {
                $pings = array_slice($pings, -MAX_STORED_PINGS);
            }

            // Save pings
            savePings($pingDataFile, $pings);

            sendSuccess([
                'ping' => $pingEntry,
                'serverTime' => $now
            ], 'Ping added successfully');
            break;

        case 'clear_pings':
            // Clear all pings (GM only feature if needed)
            savePings($pingDataFile, []);
            sendSuccess(null, 'Pings cleared');
            break;

        default:
            sendError(400, 'Invalid action');
    }
}
?>
