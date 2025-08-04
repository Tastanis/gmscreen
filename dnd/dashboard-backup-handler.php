<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Unauthorized access']);
    exit;
}

// Only handle POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Only POST requests allowed']);
    exit;
}

// Include backup helper
require_once 'includes/dashboard-backup-helper.php';

$dataDir = 'data';
$charactersFile = $dataDir . '/characters.json';

// Initialize backup system
$backupHelper = new DashboardBackupHelper($dataDir);

// Set response header
header('Content-Type: application/json');

// Handle actions
$action = $_POST['action'] ?? '';

switch ($action) {
    case 'create_session_backup':
        // Create session backup
        $result = $backupHelper->createBackup($charactersFile, 'session');
        echo json_encode($result);
        break;
        
    case 'create_pre_save_backup':
        // Create pre-save backup (goes to "recent" category)
        $result = $backupHelper->createBackup($charactersFile, 'pre-save');
        echo json_encode($result);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action: ' . $action]);
        break;
}
?>