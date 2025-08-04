<?php
session_start();

// Check if user is logged in as GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// Include backup helper
require_once 'includes/backup-helper.php';

// Data file path
$dataFile = 'data/templates.json';
$dataDir = dirname($dataFile);

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'save':
            $data = json_decode($_POST['data'] ?? '{}', true);
            $backupType = $_POST['backup_type'] ?? 'auto';
            
            if (!$data) {
                echo json_encode(['success' => false, 'error' => 'Invalid data']);
                exit;
            }
            
            // Create appropriate backup based on type
            if (file_exists($dataFile)) {
                $backupHelper = new TemplateBackupHelper();
                $backupResult = $backupHelper->createBackup($backupType);
                
                if (!$backupResult['success']) {
                    error_log('Failed to create backup: ' . $backupResult['error']);
                }
            }
            
            // Save data
            $jsonData = json_encode($data, JSON_PRETTY_PRINT);
            if (file_put_contents($dataFile, $jsonData, LOCK_EX) !== false) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to save data']);
            }
            break;
            
        case 'backup':
            $backupHelper = new TemplateBackupHelper();
            $result = $backupHelper->createBackup('manual');
            echo json_encode($result);
            break;
            
        case 'restore':
            $backupFile = $_POST['backup_file'] ?? '';
            if (!$backupFile) {
                echo json_encode(['success' => false, 'error' => 'No backup file specified']);
                exit;
            }
            
            $backupHelper = new TemplateBackupHelper();
            $result = $backupHelper->restoreBackup($backupFile);
            echo json_encode($result);
            break;
            
        case 'list_backups':
            $backupHelper = new TemplateBackupHelper();
            $backups = $backupHelper->listBackups();
            echo json_encode(['success' => true, 'backups' => $backups]);
            break;
            
        default:
            echo json_encode(['success' => false, 'error' => 'Unknown action']);
    }
    exit;
}

// GET request - return current data
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data) {
            echo json_encode(['success' => true, 'data' => $data]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid data file']);
        }
    } else {
        // Return default structure
        $defaultData = [
            'templates' => [],
            'metadata' => [
                'last_updated' => date('Y-m-d H:i:s'),
                'version' => '1.0.0'
            ]
        ];
        echo json_encode(['success' => true, 'data' => $defaultData]);
    }
    exit;
}