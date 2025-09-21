<?php
// Chat handler for dashboard real-time messaging
// Handles chat_send, chat_fetch, and chat_upload actions

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$chatDataFile = __DIR__ . '/data/chat_messages.json';
$chatUploadsDir = __DIR__ . '/chat_uploads';
$maxMessages = 100;

ensureChatStorage($chatDataFile, $chatUploadsDir);

$chatAction = substr($_POST['action'], 5); // remove "chat_" prefix

switch ($chatAction) {
    case 'send':
        handleChatSend($chatDataFile, $maxMessages);
        break;

    case 'fetch':
        handleChatFetch($chatDataFile);
        break;

    case 'upload':
        handleChatUpload($chatUploadsDir);
        break;

    default:
        echo json_encode(['success' => false, 'error' => 'Invalid chat action']);
        exit;
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

function handleChatSend($dataFile, $maxMessages) {
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    $rawMessage = $_POST['message'] ?? '';
    $message = sanitizeMessage($rawMessage);

    if ($message === '') {
        echo json_encode(['success' => false, 'error' => 'Message cannot be empty']);
        exit;
    }

    $messages = loadChatMessages($dataFile);

    $entry = [
        'id' => uniqid('msg_', true),
        'timestamp' => date('c'),
        'user' => $_SESSION['user'],
        'message' => $message
    ];

    $messages[] = $entry;
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

function handleChatFetch($dataFile) {
    $messages = loadChatMessages($dataFile);
    $since = $_POST['since'] ?? '';
    $filtered = $messages;

    if ($since !== '') {
        $filtered = array_filter($messages, function ($message) use ($since) {
            if (!isset($message['timestamp'])) {
                return false;
            }

            $messageTime = strtotime($message['timestamp']);
            $sinceTime = strtotime($since);
            if ($sinceTime === false) {
                return true;
            }

            return $messageTime !== false && $messageTime > $sinceTime;
        });
        $filtered = array_values($filtered);
    }

    $latest = null;
    if (!empty($messages)) {
        $latest = $messages[count($messages) - 1]['timestamp'] ?? null;
    }

    echo json_encode([
        'success' => true,
        'messages' => $filtered,
        'latest' => $latest
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
