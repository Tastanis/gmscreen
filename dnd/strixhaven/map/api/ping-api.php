<?php
/**
 * Ping API Endpoints
 * RESTful API for map ping operations (cross-user pings)
 */

session_start();
require_once __DIR__ . '/../../../includes/players.php'; players_gate(); // a player turned off is logged out
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
// Nothing below writes the session. Letting go of it here means this player's other requests (the board, the
// sheet, the chat) are not held in a queue behind a ping read: every open map asks twice a second.
session_write_close();

// Ping storage file path
$pingDataFile = __DIR__ . '/../data/pings.json';
// Held shared by a read and exclusively by a whole add or clear (read, change, write), so two pings sent at
// once are both kept and a read never sees a half-written file.
$pingLockFile = __DIR__ . '/../data/pings.lock';

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

/**
 * Runs $work while holding the ping lock: shared for a read, exclusive for a change. A change reads, alters and
 * writes inside the one lock. If the lock file cannot be opened the work still runs, as it did before there
 * was a lock.
 */
function withPingLock($exclusive, $work) {
    global $pingLockFile;

    $lockFp = @fopen($pingLockFile, 'c');
    $locked = $lockFp ? flock($lockFp, $exclusive ? LOCK_EX : LOCK_SH) : false;
    try {
        return $work();
    } finally {
        if ($lockFp) {
            if ($locked) {
                flock($lockFp, LOCK_UN);
            }
            fclose($lockFp);
        }
    }
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
            // A read only reads: it answers with the pings still alive and leaves the file alone. Expired
            // pings are dropped from the file by the next ping added (or a clear).
            $pings = withPingLock(false, function () use ($pingDataFile) {
                return cleanExpiredPings(loadPings($pingDataFile));
            });

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

            // Optional exact camera for the 3D map (position x,y,z then target x,y,z).
            // Only the GM's view is ever stored, so only the GM can put players on a view.
            $view = null;
            if ($user === 'GM' && isset($input['view']) && is_array($input['view']) && count($input['view']) === 6) {
                $view = array_map('floatval', array_values($input['view']));
            }

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
            if ($view !== null) {
                $pingEntry['view'] = $view;
            }

            withPingLock(true, function () use ($pingDataFile, $pingEntry) {
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
            });

            sendSuccess([
                'ping' => $pingEntry,
                'serverTime' => $now
            ], 'Ping added successfully');
            break;

        case 'clear_pings':
            // Clear all pings (GM only feature if needed)
            withPingLock(true, function () use ($pingDataFile) {
                savePings($pingDataFile, []);
            });
            sendSuccess(null, 'Pings cleared');
            break;

        default:
            sendError(400, 'Invalid action');
    }
}
?>
