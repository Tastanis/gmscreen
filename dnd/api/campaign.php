<?php
/**
 * The heroes' projects, relationships and record info (JSON). Replaces the dashboard's data endpoints.
 * POST (or GET for reads) action=... ; the contract is in includes/campaign-api.php.
 * Session login as everywhere: the Director is user "GM"; a player only ever sees their own hero.
 */

session_start();
require_once __DIR__ . '/../includes/players.php';
players_gate(); // a player turned off is logged out
require_once __DIR__ . '/../includes/campaign-api.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(array('success' => false, 'error' => 'Not logged in'));
    exit;
}
$user = (string) ($_SESSION['user'] ?? '');
// The session is only read here; let other requests from this browser run alongside.
session_write_close();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$reads = array('revision', 'heroes', 'character', 'all_characters', 'get_all_characters', 'students_lookup', 'get_students_for_autocomplete');
$params = $method === 'POST' ? $_POST : $_GET;
$action = (string) ($params['action'] ?? '');

if ($method !== 'POST' && !in_array($action, $reads, true)) {
    http_response_code(405);
    echo json_encode(array('success' => false, 'error' => 'Use POST to change data'));
    exit;
}
if ($method === 'POST' && ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    http_response_code(403);
    echo json_encode(array('success' => false, 'error' => 'Cross-site requests are not allowed'));
    exit;
}

echo json_encode(campaign_api_handle($action, $params, $user));
