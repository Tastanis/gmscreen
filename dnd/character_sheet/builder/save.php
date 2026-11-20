<?php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/../../includes/players.php';
require_once __DIR__ . '/CharacterLibrary.php';
players_gate();
header('Content-Type: application/json');
header('Cache-Control: no-store');
function library_error(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}
$user = $_SESSION['user'] ?? '';
if (empty($_SESSION['logged_in']) || $user === '') library_error(401, 'Sign in to save your hero.');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') library_error(405, 'Use POST to save a character.');
if (!hash_equals(character_library_token(), $_SERVER['HTTP_X_CHARACTER_TOKEN'] ?? '')) library_error(403, 'Reopen the builder and try again.');
session_write_close();
try {
    $body = file_get_contents('php://input', false, null, 0, 2097153);
    if ($body === false || strlen($body) > 2097152) library_error(413, 'The character file is too large.');
    $sheet = json_decode($body, false, 64, JSON_THROW_ON_ERROR);
    if (!$sheet instanceof stdClass) library_error(422, 'Choose a completed character sheet.');
    echo json_encode(['id' => character_library()->save($user, $sheet)]);
} catch (JsonException | InvalidArgumentException $e) {
    library_error(422, 'The character file could not be read as a finished sheet.');
} catch (Throwable $e) {
    library_error(503, 'My Characters could not save this sheet. Your builder draft is still available.');
}
