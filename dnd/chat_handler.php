<?php
// Chat handler for dashboard real-time messaging
// Handles chat_send, chat_fetch, and chat_upload actions

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
    $message = sanitizeMessage($rawMessage);
    $imageUrl = sanitizeImageUrl($rawImageUrl);

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
        'timestamp' => date('c'),
        'user' => $currentUser,
        'message' => $message,
        'type' => $messageType
    ];

    if ($imageUrl !== '') {
        $entry['imageUrl'] = $imageUrl;
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

    echo json_encode(['success' => true, 'message' => $entry]);
    exit;
}

function handleChatFetch($dataFile, array $validParticipants) {
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    $messages = loadChatMessages($dataFile);
    $since = $_POST['since'] ?? '';
    $sinceTime = $since !== '' ? strtotime($since) : false;
    $currentUser = $_SESSION['user'];
    $filtered = [];

    foreach ($messages as $message) {
        if (!is_array($message)) {
            continue;
        }

        if (!isWhisperVisibleTo($message, $currentUser)) {
            continue;
        }

        if ($sinceTime !== false) {
            if (!isset($message['timestamp'])) {
                continue;
            }

            $messageTime = strtotime($message['timestamp']);
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
        'latest' => $latest
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

    $messages = loadChatMessages($dataFile);
    $updatedMessage = null;
    $awardResult = null;
    $awardError = null;
    $messageFound = false;

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
        $sanitizedPayload['status'] = $status;

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

    echo json_encode([
        'success' => true,
        'message' => $updatedMessage,
        'award' => $awardResult
    ]);
    exit;
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

    echo json_encode([
        'success' => true,
        'url' => $relativePath,
        'filename' => $safeName,
        'mime' => $mimeType
    ]);
    exit;
}
