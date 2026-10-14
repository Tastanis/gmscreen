<?php
// Chat handler for dashboard real-time messaging
// Handles chat_send, chat_fetch, and chat_upload actions

require_once __DIR__ . '/includes/chat_pusher.php';
require_once __DIR__ . '/includes/ask-test.php';

if (PHP_SAPI !== 'cli') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $chatDataFile = __DIR__ . '/data/chat_messages.json';
    $chatUploadsDir = __DIR__ . '/chat_uploads';
    $maxMessages = 100;
    $chatParticipantsMap = require __DIR__ . '/includes/chat_participants.php';
    $chatParticipantIds = array_keys($chatParticipantsMap);

    ensureChatStorage($chatDataFile, $chatUploadsDir);

    $chatAction = substr($_POST['action'], 5); // remove "chat_" prefix

    switch ($chatAction) {
        case 'send':
            handleChatSend($chatDataFile, $maxMessages, $chatParticipantIds);
            break;

        case 'fetch':
            handleChatFetch($chatDataFile, $chatParticipantIds);
            break;

        case 'upload':
            handleChatUpload($chatUploadsDir);
            break;

        case 'update_roll':
            handleRollStatusUpdate($chatDataFile);
            break;

        case 'clear':
            handleChatClear($chatDataFile);
            break;

        // The Director asks heroes for a test (includes/ask-test.php).
        case 'test_ask':
        case 'test_state':
        case 'test_sheet':
        case 'test_roll':
            handleAskTest($chatAction, $chatDataFile, $maxMessages, $chatParticipantsMap);
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Invalid chat action']);
            exit;
    }
}

function ensureChatStorage($dataFile, $uploadsDir) {
    $dataDir = dirname($dataFile);
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    if (!file_exists($dataFile)) {
        file_put_contents($dataFile, json_encode([], JSON_PRETTY_PRINT), LOCK_EX);
    }

    if (!is_dir($uploadsDir)) {
        mkdir($uploadsDir, 0755, true);
    }
}

function loadChatMessages($dataFile) {
    if (!file_exists($dataFile)) {
        return [];
    }

    $fp = fopen($dataFile, 'r');
    if ($fp === false) {
        return [];
    }

    $content = '';
    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function saveChatMessages($dataFile, array $messages) {
    $json = json_encode($messages, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $json, LOCK_EX) !== false;
}

function acquireChatRollDecisionLock($dataFile)
{
    $lockHandle = fopen($dataFile . '.roll.lock', 'c');
    if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
        if (is_resource($lockHandle)) {
            fclose($lockHandle);
        }
        return null;
    }

    return $lockHandle;
}

function sanitizeMessage($message) {
    $clean = trim($message);
    $clean = strip_tags($clean);
    if ($clean === '') {
        return '';
    }

    return htmlspecialchars($clean, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function sanitizePlainText($value)
{
    if (!is_string($value)) {
        return '';
    }

    return trim(strip_tags($value));
}

function sanitizeMessageType($type)
{
    if (!is_string($type)) {
        return 'text';
    }

    $clean = strtolower(trim($type));
    $allowed = ['text', 'dice_roll', 'project_roll', 'whisper'];
    return in_array($clean, $allowed, true) ? $clean : 'text';
}

function parseKnownProjectRollStatuses($value)
{
    if (!is_string($value) || trim($value) === '') {
        return [];
    }

    $decoded = json_decode($value, true);
    if (!is_array($decoded)) {
        return [];
    }

    $allowed = ['pending', 'accepted', 'denied'];
    $normalized = [];
    foreach ($decoded as $messageId => $status) {
        if (count($normalized) >= 100) {
            break;
        }
        if (!is_string($messageId) || !is_string($status)) {
            continue;
        }
        $messageId = trim($messageId);
        $status = strtolower(trim($status));
        if ($messageId !== '' && in_array($status, $allowed, true)) {
            $normalized[$messageId] = $status;
        }
    }

    return $normalized;
}

function hasProjectRollStatusChanged(array $message, array $knownStatuses)
{
    $messageId = isset($message['id']) && is_string($message['id']) ? $message['id'] : '';
    if ($messageId === '' || !array_key_exists($messageId, $knownStatuses)) {
        return false;
    }

    if (sanitizeMessageType($message['type'] ?? 'text') !== 'project_roll') {
        return false;
    }

    $payload = isset($message['payload']) && is_array($message['payload']) ? $message['payload'] : [];
    $currentStatus = sanitizeRollPayload('project_roll', $payload)['status'] ?? 'pending';
    return $knownStatuses[$messageId] !== $currentStatus;
}

function resolveProjectRollStatusTransition($previousStatus, $requestedStatus)
{
    $previousStatus = is_string($previousStatus) ? strtolower(trim($previousStatus)) : 'pending';
    $requestedStatus = is_string($requestedStatus) ? strtolower(trim($requestedStatus)) : 'pending';
    return $previousStatus === 'pending' ? $requestedStatus : $previousStatus;
}

function sanitizeChatTarget($value, array $validParticipants)
{
    if (!is_string($value)) {
        return '';
    }

    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    return in_array($trimmed, $validParticipants, true) ? $trimmed : '';
}

function normalizeWhisperConversationKey($sender, $recipient)
{
    $participants = [$sender ?? '', $recipient ?? ''];
    sort($participants, SORT_STRING);
    return implode('|', $participants);
}

function pruneWhisperMessages(array $messages, $limitPerConversation = 5)
{
    if ($limitPerConversation <= 0) {
        return $messages;
    }

    $conversationMap = [];

    foreach ($messages as $index => $message) {
        if (!is_array($message)) {
            continue;
        }

        $type = sanitizeMessageType($message['type'] ?? 'text');
        if ($type !== 'whisper') {
            continue;
        }

        $sender = isset($message['user']) ? (string) $message['user'] : '';
        $recipient = isset($message['target']) ? (string) $message['target'] : '';
        if ($sender === '' || $recipient === '') {
            continue;
        }

        $key = normalizeWhisperConversationKey($sender, $recipient);
        if (!isset($conversationMap[$key])) {
            $conversationMap[$key] = [];
        }

        $conversationMap[$key][] = $index;
    }

    foreach ($conversationMap as $indices) {
        if (count($indices) <= $limitPerConversation) {
            continue;
        }

        $excess = count($indices) - $limitPerConversation;
        sort($indices, SORT_NUMERIC);
        for ($i = 0; $i < $excess; $i++) {
            $removeIndex = $indices[$i];
            unset($messages[$removeIndex]);
        }
    }

    return array_values($messages);
}

function isWhisperVisibleTo(array $message, $currentUser)
{
    // A line the site itself wrote for named people only (the result of a test the Director asked for): nobody
    // else is sent it. A message that comes in through chat_send never carries this.
    if (isset($message['only'])) {
        return is_array($message['only']) && is_string($currentUser) && in_array($currentUser, $message['only'], true);
    }

    $type = sanitizeMessageType($message['type'] ?? 'text');
    if ($type !== 'whisper') {
        return true;
    }

    if (!is_string($currentUser) || $currentUser === '') {
        return false;
    }

    $sender = isset($message['user']) ? (string) $message['user'] : '';
    $recipient = isset($message['target']) ? (string) $message['target'] : '';

    return $sender === $currentUser || $recipient === $currentUser;
}

function sanitizeDiceNotation($notation)
{
    if (!is_string($notation)) {
        return '';
    }

    $clean = preg_replace('/[^0-9dD+\-\s]/', '', $notation);
    return trim($clean);
}

function sanitizeRollBreakdown(array $breakdown)
{
    $sanitized = [];

    foreach ($breakdown as $entry) {
        if (!is_array($entry) || !isset($entry['type'])) {
            continue;
        }

        $type = $entry['type'];
        if ($type === 'dice') {
            $rolls = [];
            if (isset($entry['rolls']) && is_array($entry['rolls'])) {
                foreach ($entry['rolls'] as $roll) {
                    $rolls[] = intval($roll);
                }
            }

            $sanitized[] = [
                'type' => 'dice',
                'notation' => sanitizeDiceNotation($entry['notation'] ?? ''),
                'rolls' => $rolls,
                'total' => isset($entry['total']) ? intval($entry['total']) : array_sum($rolls)
            ];
        } elseif ($type === 'modifier') {
            $value = isset($entry['value']) ? intval($entry['value']) : 0;
            $sanitized[] = [
                'type' => 'modifier',
                'notation' => sanitizeDiceNotation($entry['notation'] ?? ''),
                'value' => $value
            ];
        }
    }

    return $sanitized;
}

function sanitizeRollComponents($components)
{
    if (!is_array($components)) {
        return [];
    }

    $sanitized = [];
    foreach ($components as $component) {
        $sanitized[] = sanitizeDiceNotation(is_string($component) ? $component : '');
    }

    return $sanitized;
}

function sanitizeProjectIdentifier($value)
{
    if (!is_string($value)) {
        return '';
    }

    return preg_replace('/[^a-z0-9_\-]/i', '', $value);
}

function sanitizeRollPayload($type, $payload)
{
    if (!is_array($payload)) {
        return [];
    }

    switch ($type) {
        case 'dice_roll':
            return [
                'expression' => sanitizeDiceNotation($payload['expression'] ?? ''),
                'components' => sanitizeRollComponents($payload['components'] ?? []),
                'breakdown' => sanitizeRollBreakdown($payload['breakdown'] ?? []),
                'total' => isset($payload['total']) ? intval($payload['total']) : 0
            ];

        case 'project_roll':
            $status = strtolower(trim($payload['status'] ?? 'pending'));
            if (!in_array($status, ['pending', 'accepted', 'denied'], true)) {
                $status = 'pending';
            }

            return [
                'expression' => sanitizeDiceNotation($payload['expression'] ?? ''),
                'components' => sanitizeRollComponents($payload['components'] ?? []),
                'breakdown' => sanitizeRollBreakdown($payload['breakdown'] ?? []),
                'total' => isset($payload['total']) ? intval($payload['total']) : 0,
                'projectName' => sanitizePlainText($payload['projectName'] ?? ''),
                'projectIndex' => isset($payload['projectIndex']) ? max(0, intval($payload['projectIndex'])) : 0,
                'characterId' => sanitizeProjectIdentifier($payload['characterId'] ?? ''),
                'status' => $status
            ];

        default:
            return [];
    }
}

function applyProjectRollAward(array $payload)
{
    $characterRaw = $payload['characterId'] ?? '';
    $character = is_string($characterRaw) ? trim($characterRaw) : '';
    $projectIndex = isset($payload['projectIndex']) ? intval($payload['projectIndex']) : -1;
    $delta = isset($payload['total']) ? intval($payload['total']) : 0;
    $projectNameRaw = $payload['projectName'] ?? '';
    $projectName = is_string($projectNameRaw) ? trim($projectNameRaw) : '';

    if ($character === '') {
        return ['error' => 'Character not specified'];
    }

    $dataFile = __DIR__ . '/data/characters.json';
    if (!file_exists($dataFile)) {
        return ['error' => 'Character data not found'];
    }

    $fp = fopen($dataFile, 'c+');
    if ($fp === false) {
        return ['error' => 'Unable to open character data'];
    }

    $lockAcquired = false;

    try {
        if (!flock($fp, LOCK_EX)) {
            return ['error' => 'Unable to lock character data'];
        }

        $lockAcquired = true;
        rewind($fp);
        $content = stream_get_contents($fp);
        $data = json_decode($content, true);

        if (!is_array($data) || !isset($data[$character])) {
            return ['error' => 'Character not found'];
        }

        if (!isset($data[$character]['projects']) || !is_array($data[$character]['projects'])) {
            return ['error' => 'No projects found for character'];
        }

        $projects = &$data[$character]['projects'];
        $resolvedIndex = null;

        if ($projectIndex >= 0 && isset($projects[$projectIndex])) {
            $resolvedIndex = $projectIndex;
        } elseif ($projectName !== '') {
            $normalizedName = strtolower($projectName);

            foreach ($projects as $index => $project) {
                if (!is_array($project)) {
                    continue;
                }

                $candidate = '';
                if (isset($project['project_name']) && is_string($project['project_name'])) {
                    $candidate = $project['project_name'];
                } elseif (isset($project['name']) && is_string($project['name'])) {
                    $candidate = $project['name'];
                }

                if ($candidate === '') {
                    continue;
                }

                if (strtolower(trim($candidate)) === $normalizedName) {
                    $resolvedIndex = (int) $index;
                    break;
                }
            }
        }

        if ($resolvedIndex === null) {
            return ['error' => 'Selected project could not be found'];
        }

        $project = &$projects[$resolvedIndex];
        $current = isset($project['points_earned']) ? intval($project['points_earned']) : 0;
        $newTotal = $current + $delta;
        $project['points_earned'] = (string) $newTotal;

        if (!isset($project['points_history']) || !is_array($project['points_history'])) {
            $project['points_history'] = [];
        }

        $project['points_history'][] = $newTotal;
        if (count($project['points_history']) > 10) {
            $project['points_history'] = array_slice($project['points_history'], -10);
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        fflush($fp);

        return [
            'character' => $character,
            'projectIndex' => $resolvedIndex,
            'delta' => $delta,
            'newPoints' => $newTotal
        ];
    } finally {
        if ($lockAcquired) {
            flock($fp, LOCK_UN);
        }

        fclose($fp);
    }
}

function sanitizeImageUrl($url) {
    if (!is_string($url)) {
        return '';
    }

    $trimmed = trim($url);
    if ($trimmed === '') {
        return '';
    }

    $sanitized = filter_var($trimmed, FILTER_SANITIZE_URL);
    if ($sanitized === '') {
        return '';
    }

    $lower = strtolower($sanitized);
    if (strpos($lower, 'javascript:') === 0) {
        return '';
    }

    if (preg_match('#^(https?:)?//#', $sanitized)) {
        return $sanitized;
    }

    if (strpos($sanitized, '..') !== false) {
        return '';
    }

    if ($sanitized[0] === '/') {
        return $sanitized;
    }

    if (preg_match('#^[A-Za-z0-9_\-./]+$#', $sanitized)) {
        return $sanitized;
    }

    return '';
}

function handleChatSend($dataFile, $maxMessages, array $validParticipants) {
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    $rawMessage = $_POST['message'] ?? '';
    $rawImageUrl = $_POST['imageUrl'] ?? '';
    $rawThumbnailUrl = $_POST['thumbnailUrl'] ?? '';
    $message = sanitizeMessage($rawMessage);
    $imageUrl = sanitizeImageUrl($rawImageUrl);
    $thumbnailUrl = sanitizeImageUrl($rawThumbnailUrl);

    if ($message === '' && $imageUrl === '') {
        echo json_encode(['success' => false, 'error' => 'Message cannot be empty']);
        exit;
    }

    $messageType = sanitizeMessageType($_POST['type'] ?? 'text');
    $targetRaw = $_POST['target'] ?? '';
    $target = sanitizeChatTarget($targetRaw, $validParticipants);
    $payloadRaw = $_POST['payload'] ?? '';
    $payload = [];
    if ($payloadRaw !== '') {
        $decoded = json_decode($payloadRaw, true);
        if (is_array($decoded)) {
            $payload = sanitizeRollPayload($messageType, $decoded);
        }
    }

    $currentUser = $_SESSION['user'];

    if ($messageType === 'whisper') {
        if ($target === '' || $target === $currentUser) {
            echo json_encode(['success' => false, 'error' => 'Invalid whisper target']);
            exit;
        }
    } else {
        $target = '';
    }

    $messages = loadChatMessages($dataFile);

    $entry = [
        'id' => uniqid('msg_', true),
        'timestamp' => nextChatTimestamp($messages),
        'user' => $currentUser,
        'message' => $message,
        'type' => $messageType
    ];

    if ($imageUrl !== '') {
        $entry['imageUrl'] = $imageUrl;
    }

    if ($thumbnailUrl !== '') {
        $entry['thumbnailUrl'] = $thumbnailUrl;
    }

    if (!empty($payload)) {
        $entry['payload'] = $payload;
    }

    if ($target !== '') {
        $entry['target'] = $target;
    }

    $messages[] = $entry;
    $messages = pruneWhisperMessages($messages, 5);
    if (count($messages) > $maxMessages) {
        $messages = array_slice($messages, -1 * $maxMessages);
    }

    if (!saveChatMessages($dataFile, $messages)) {
        echo json_encode(['success' => false, 'error' => 'Failed to save message']);
        exit;
    }

    broadcastChatUpdate($messageType === 'whisper' ? 'whisper' : 'message');

    echo json_encode(['success' => true, 'message' => $entry]);
    exit;
}

function handleChatFetch($dataFile, array $validParticipants) {
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    $messages = loadChatMessages($dataFile);
    // To the millisecond (nextChatTimestamp): with whole seconds, a message written in the same second as the
    // last one a page had seen was never sent to that page.
    $sinceTime = chatTimestampValue($_POST['since'] ?? '');
    $currentUser = $_SESSION['user'];
    $knownRollStatuses = parseKnownProjectRollStatuses($_POST['knownRollStatuses'] ?? '');
    $filtered = [];

    foreach ($messages as $message) {
        if (!is_array($message)) {
            continue;
        }

        if (!isWhisperVisibleTo($message, $currentUser)) {
            continue;
        }

        if ($sinceTime !== false && !hasProjectRollStatusChanged($message, $knownRollStatuses)) {
            if (!isset($message['timestamp'])) {
                continue;
            }

            $messageTime = chatTimestampValue($message['timestamp']);
            if ($messageTime === false || $messageTime <= $sinceTime) {
                continue;
            }
        }

        $filtered[] = $message;
    }

    $latest = null;
    if (!empty($messages)) {
        $latest = $messages[count($messages) - 1]['timestamp'] ?? null;
    }

    echo json_encode([
        'success' => true,
        'messages' => array_values($filtered),
        'latest' => $latest,
        // A mark that changes when a test is asked for or rolled, so the page asks for the tests only then.
        'tests' => AskTest::stamp(askTestFile())
    ]);
    exit;
}

function handleChatClear($dataFile)
{
    if (!isset($_SESSION['user']) || $_SESSION['user'] !== 'GM') {
        echo json_encode(['success' => false, 'error' => 'Only the GM can clear the chat history.']);
        exit;
    }

    if (!saveChatMessages($dataFile, [])) {
        echo json_encode(['success' => false, 'error' => 'Failed to clear chat history.']);
        exit;
    }

    broadcastChatUpdate('clear');

    echo json_encode(['success' => true]);
    exit;
}

function handleRollStatusUpdate($dataFile)
{
    if (!isset($_SESSION['user']) || $_SESSION['user'] !== 'GM') {
        echo json_encode(['success' => false, 'error' => 'Only GM can modify roll status']);
        exit;
    }

    $messageId = isset($_POST['messageId']) ? trim($_POST['messageId']) : '';
    $status = isset($_POST['status']) ? strtolower(trim($_POST['status'])) : '';
    $allowed = ['pending', 'accepted', 'denied'];

    if ($messageId === '' || !in_array($status, $allowed, true)) {
        echo json_encode(['success' => false, 'error' => 'Invalid request']);
        exit;
    }

    // Serialize project-roll decisions across GM tabs. This makes the
    // pending-to-terminal transition atomic and prevents duplicate awards.
    $decisionLock = acquireChatRollDecisionLock($dataFile);
    if ($decisionLock === null) {
        echo json_encode(['success' => false, 'error' => 'Unable to lock project roll decision']);
        exit;
    }

    $messages = loadChatMessages($dataFile);
    $updatedMessage = null;
    $awardResult = null;
    $awardError = null;
    $messageFound = false;
    $statusChanged = false;

    foreach ($messages as &$message) {
        if (!isset($message['id']) || $message['id'] !== $messageId) {
            continue;
        }

        $messageFound = true;

        $messageType = sanitizeMessageType($message['type'] ?? 'text');
        if ($messageType !== 'project_roll') {
            break;
        }

        if (!isset($message['payload']) || !is_array($message['payload'])) {
            $message['payload'] = [];
        }

        $sanitizedPayload = sanitizeRollPayload('project_roll', $message['payload']);
        $previousStatus = $sanitizedPayload['status'] ?? 'pending';
        $resolvedStatus = resolveProjectRollStatusTransition($previousStatus, $status);

        // Accept/deny is a one-time decision. A stale second GM tab must not
        // reverse a completed decision or award the same project roll twice.
        if ($previousStatus !== 'pending') {
            $sanitizedPayload['status'] = $resolvedStatus;
            $message['payload'] = $sanitizedPayload;
            $updatedMessage = $message;
            break;
        }

        $sanitizedPayload['status'] = $resolvedStatus;
        $statusChanged = $resolvedStatus !== $previousStatus;

        if ($status === 'accepted' && $previousStatus !== 'accepted') {
            $awardResult = applyProjectRollAward($sanitizedPayload);

            if (!is_array($awardResult) || isset($awardResult['error'])) {
                $awardError = is_array($awardResult) && isset($awardResult['error'])
                    ? $awardResult['error']
                    : 'Failed to award project roll.';
                $awardResult = null;
                break;
            }

            if (isset($awardResult['projectIndex'])) {
                $sanitizedPayload['projectIndex'] = $awardResult['projectIndex'];
            }
        }

        $message['payload'] = $sanitizedPayload;
        $updatedMessage = $message;
        break;
    }

    if ($updatedMessage === null && !$messageFound) {
        echo json_encode(['success' => false, 'error' => 'Message not found']);
        exit;
    }

    if ($awardError !== null) {
        echo json_encode(['success' => false, 'error' => $awardError]);
        exit;
    }

    if (!saveChatMessages($dataFile, $messages)) {
        echo json_encode(['success' => false, 'error' => 'Failed to update message']);
        exit;
    }

    broadcastChatUpdate('roll-status');

    echo json_encode([
        'success' => true,
        'message' => $updatedMessage,
        'award' => $awardResult,
        'changed' => $statusChanged
    ]);
    exit;
}

function generateChatThumbnail($sourcePath, $mimeType, $uploadsDir, $originalName) {
    $imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($mimeType, $imageTypes)) {
        return null;
    }

    $imageInfo = @getimagesize($sourcePath);
    if ($imageInfo === false) {
        return null;
    }

    $origWidth = $imageInfo[0];
    $origHeight = $imageInfo[1];

    $maxWidth = 400;
    $maxHeight = 300;

    if ($origWidth <= $maxWidth && $origHeight <= $maxHeight) {
        return null; // Already small enough
    }

    $ratio = min($maxWidth / $origWidth, $maxHeight / $origHeight);
    $newWidth = (int) round($origWidth * $ratio);
    $newHeight = (int) round($origHeight * $ratio);

    switch ($mimeType) {
        case 'image/jpeg':
            $sourceImage = @imagecreatefromjpeg($sourcePath);
            break;
        case 'image/png':
            $sourceImage = @imagecreatefrompng($sourcePath);
            break;
        case 'image/gif':
            $sourceImage = @imagecreatefromgif($sourcePath);
            break;
        case 'image/webp':
            $sourceImage = @imagecreatefromwebp($sourcePath);
            break;
        default:
            return null;
    }

    if (!$sourceImage) {
        return null;
    }

    $thumbnail = imagecreatetruecolor($newWidth, $newHeight);
    if (!$thumbnail) {
        imagedestroy($sourceImage);
        return null;
    }

    // Preserve transparency for PNG and WebP
    if ($mimeType === 'image/png' || $mimeType === 'image/webp') {
        imagealphablending($thumbnail, false);
        imagesavealpha($thumbnail, true);
        $transparent = imagecolorallocatealpha($thumbnail, 0, 0, 0, 127);
        imagefilledrectangle($thumbnail, 0, 0, $newWidth, $newHeight, $transparent);
    }

    imagecopyresampled($thumbnail, $sourceImage, 0, 0, 0, 0, $newWidth, $newHeight, $origWidth, $origHeight);

    $thumbName = 'thumb_' . $originalName;
    $thumbPath = rtrim($uploadsDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $thumbName;

    $saved = false;
    switch ($mimeType) {
        case 'image/jpeg':
            $saved = imagejpeg($thumbnail, $thumbPath, 80);
            break;
        case 'image/png':
            $saved = imagepng($thumbnail, $thumbPath, 6);
            break;
        case 'image/gif':
            $saved = imagegif($thumbnail, $thumbPath);
            break;
        case 'image/webp':
            $saved = imagewebp($thumbnail, $thumbPath, 80);
            break;
    }

    imagedestroy($sourceImage);
    imagedestroy($thumbnail);

    if ($saved) {
        return 'chat_uploads/' . $thumbName;
    }

    return null;
}

function handleChatUpload($uploadsDir) {
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    if (!isset($_FILES['file'])) {
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        exit;
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'Upload failed']);
        exit;
    }

    $maxSize = 5 * 1024 * 1024; // 5 MB
    if ($file['size'] > $maxSize) {
        echo json_encode(['success' => false, 'error' => 'File is too large']);
        exit;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    $allowedTypes = [
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/gif' => '.gif',
        'image/webp' => '.webp',
        'application/pdf' => '.pdf'
    ];

    if (!isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'error' => 'Unsupported file type']);
        exit;
    }

    if (!is_dir($uploadsDir)) {
        mkdir($uploadsDir, 0755, true);
    }

    $safeName = uniqid('chat_', true) . $allowedTypes[$mimeType];
    $destination = rtrim($uploadsDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $safeName;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        echo json_encode(['success' => false, 'error' => 'Failed to store upload']);
        exit;
    }

    $relativePath = 'chat_uploads/' . $safeName;

    $response = [
        'success' => true,
        'url' => $relativePath,
        'filename' => $safeName,
        'mime' => $mimeType
    ];

    $thumbnailUrl = generateChatThumbnail($destination, $mimeType, $uploadsDir, $safeName);
    if ($thumbnailUrl !== null) {
        $response['thumbnailUrl'] = $thumbnailUrl;
    }

    echo json_encode($response);
    exit;
}

/**
 * The time of a chat message as a number, to the millisecond, or false when it is not a time.
 */
function chatTimestampValue($timestamp)
{
    if (!is_string($timestamp) || trim($timestamp) === '') {
        return false;
    }

    try {
        return (float) (new DateTimeImmutable($timestamp))->format('U.v');
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * The time to write on the next chat message: now, to the millisecond, and always later than the last message
 * already there. Pages ask for "everything after the last time I have", so two messages must never carry the
 * same time (with whole seconds they often did, and the second was then never sent to a page that had fetched
 * in between).
 */
function nextChatTimestamp(array $messages): string
{
    $now = new DateTimeImmutable('now');
    $last = end($messages);
    $lastTime = is_array($last) ? chatTimestampValue($last['timestamp'] ?? null) : false;
    $nowTime = (float) $now->format('U.v');

    // Never more than a moment ahead of the clock: a stored time far in the future is not chased.
    if ($lastTime !== false && $lastTime >= $nowTime && $lastTime - $nowTime < 5) {
        $next = DateTimeImmutable::createFromFormat('U.u', sprintf('%.6F', $lastTime + 0.001));
        if ($next !== false) {
            $now = $next->setTimezone($now->getTimezone());
        }
    }

    return $now->format('Y-m-d\TH:i:s.vP');
}

function askTestFile(): string
{
    return __DIR__ . '/data/ask_tests.json';
}

/**
 * Every hero's sheet, or null when the file is there and could not be read (it is being written): a roll must
 * never be made from numbers that were not read.
 */
function askTestSheets(): ?array
{
    $file = __DIR__ . '/character_sheet/data/character_sheets.json';
    if (!is_file($file)) {
        return [];
    }

    for ($try = 0; $try < 4; $try++) {
        $handle = @fopen($file, 'r');
        if ($handle !== false) {
            $content = flock($handle, LOCK_SH) ? stream_get_contents($handle) : '';
            flock($handle, LOCK_UN);
            fclose($handle);
            $decoded = json_decode((string) $content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        usleep(60000);
    }

    return null;
}

/**
 * Adds a line the site itself writes to the chat (a test asked for privately, a test's result).
 */
function appendChatLine($dataFile, $maxMessages, array $line): array
{
    $messages = loadChatMessages($dataFile);
    $entry = ['id' => uniqid('msg_', true), 'timestamp' => nextChatTimestamp($messages)] + $line;
    $messages[] = $entry;
    $messages = pruneWhisperMessages($messages, 5);
    if (count($messages) > $maxMessages) {
        $messages = array_slice($messages, -1 * $maxMessages);
    }
    saveChatMessages($dataFile, $messages);

    return $entry;
}

/**
 * The Director asks heroes for a test; each player answers; the roll is made here (includes/ask-test.php).
 *
 *   chat_test_ask    the Director: heroes (JSON list), characteristics (JSON list, may be empty), private (1 or 0)
 *   chat_test_state  anyone signed in: the tests they may see (a hero sees only their own row)
 *   chat_test_sheet  a hero: their own characteristics and skills, and the five skill groups
 *   chat_test_roll   a hero who was asked: test, characteristic, skill, edge (-1, 0, 1), extra
 */
function handleAskTest($action, $dataFile, $maxMessages, array $participants)
{
    $answer = static function (array $body): void {
        echo json_encode($body);
        exit;
    };
    $refuse = static function (string $why) use ($answer): void {
        $answer(['success' => false, 'error' => $why]);
    };

    $user = isset($_SESSION['user']) && is_string($_SESSION['user']) ? $_SESSION['user'] : '';
    if ($user === '') {
        $refuse('Not authenticated');
    }

    $isGm = $user === 'GM';
    $heroes = array_values(array_diff(array_keys($participants), ['GM']));
    $isHero = in_array($user, $heroes, true);
    $file = askTestFile();
    $now = time();

    try {
        if ($action === 'test_state') {
            $stamp = AskTest::stamp($file);
            if (isset($_POST['stamp']) && $_POST['stamp'] === $stamp) {
                $answer(['success' => true, 'stamp' => $stamp, 'unchanged' => true]);
            }
            $answer(['success' => true, 'stamp' => $stamp, 'tests' => AskTest::visibleTo(AskTest::read($file), $user, $isGm, $now)]);
        }

        if ($action === 'test_sheet') {
            if (!$isHero) {
                $refuse('Only a hero has a sheet to roll from.');
            }
            $sheets = askTestSheets();
            if ($sheets === null) {
                $refuse('Your sheet could not be read just now. Try again.');
            }
            $sheet = AskTest::sheetOf($sheets, $user);
            $answer(['success' => true, 'hero' => $user, 'stats' => $sheet['stats'], 'skills' => (object) $sheet['skills'], 'groups' => AskTest::SKILLS]);
        }

        if ($action === 'test_ask') {
            if (!$isGm) {
                $refuse('Only the Director asks for a test.');
            }
            $named = json_decode((string) ($_POST['heroes'] ?? ''), true);
            $asked = array_values(array_intersect($heroes, array_filter(is_array($named) ? $named : [], 'is_string')));
            if (!$asked) {
                $refuse('Pick a hero.');
            }
            $private = ($_POST['private'] ?? '') === '1';
            if ($private && count($asked) !== 1) {
                $refuse('A private test is for one hero.');
            }
            $characteristics = AskTest::characteristics(json_decode((string) ($_POST['characteristics'] ?? ''), true));
            $test = AskTest::create($asked, $characteristics, $private, $now);
            AskTest::change($file, static function (array $tests) use ($test, $private, $asked, $dataFile, $maxMessages) {
                $tests[] = $test;
                // Asked privately, it is said in that hero's whispers; asked of the table, the pop-ups say it.
                if ($private) {
                    appendChatLine($dataFile, $maxMessages, ['user' => 'GM', 'message' => 'Test: ' . AskTest::asks($test), 'type' => 'whisper', 'target' => $asked[0]]);
                }
                return ['tests' => $tests];
            });
            broadcastChatUpdate('test');
            $answer(['success' => true, 'id' => $test['id'], 'stamp' => AskTest::stamp($file), 'tests' => AskTest::visibleTo(AskTest::read($file), $user, true, $now)]);
        }

        if ($action === 'test_roll') {
            if (!$isHero) {
                $refuse('Only a hero who was asked rolls a test.');
            }
            $id = is_string($_POST['test'] ?? null) ? $_POST['test'] : '';
            $sheets = askTestSheets();
            if ($sheets === null) {
                $refuse('Your sheet could not be read just now. Try again.');
            }
            $sheet = AskTest::sheetOf($sheets, $user);
            $choice = [
                'characteristic' => $_POST['characteristic'] ?? '',
                'skill' => $_POST['skill'] ?? '',
                'edge' => is_numeric($_POST['edge'] ?? null) ? (int) $_POST['edge'] : 0,
                'extra' => $_POST['extra'] ?? 0,
            ];
            $result = AskTest::change($file, static function (array $tests) use ($id, $user, $sheet, $choice, $now, $dataFile, $maxMessages) {
                foreach ($tests as $index => $test) {
                    if (($test['id'] ?? '') !== $id) {
                        continue;
                    }
                    if (!isset($test['rows'][$user])) {
                        return ['error' => 'That test is not asking you.'];
                    }
                    if (($test['rows'][$user]['status'] ?? '') !== 'waiting') {
                        return ['error' => 'You have already rolled this test.'];
                    }
                    // The dice are rolled here, never on the player's page.
                    $row = AskTest::roll($test, $sheet, $choice, [random_int(1, 10), random_int(1, 10)], $now);
                    $tests[$index]['rows'][$user] = $row;
                    $words = 'Test: ' . AskTest::words($row);
                    // Asked privately, the result goes back in the whispers; otherwise it is a chat line that
                    // only the roller and the Director are sent. Written while the tests are held, so two heroes
                    // rolling at once cannot lose a line.
                    appendChatLine($dataFile, $maxMessages, !empty($test['private'])
                        ? ['user' => $user, 'message' => $words, 'type' => 'whisper', 'target' => 'GM']
                        : ['user' => $user, 'message' => $words, 'type' => 'text', 'only' => [$user, 'GM']]);
                    return ['tests' => $tests, 'row' => $row + ['words' => AskTest::words($row)]];
                }
                return ['error' => 'That test is no longer there.'];
            });
            if (isset($result['error'])) {
                $answer(['success' => false, 'error' => $result['error'], 'stamp' => AskTest::stamp($file)]);
            }
            broadcastChatUpdate('test');
            $answer(['success' => true, 'row' => $result['row'], 'stamp' => AskTest::stamp($file)]);
        }
    } catch (InvalidArgumentException $e) {
        $refuse($e->getMessage());
    } catch (Throwable $e) {
        error_log('[Ask test] ' . $e->getMessage());
        $refuse('The test could not be saved. Try again.');
    }

    $refuse('Invalid chat action');
}
