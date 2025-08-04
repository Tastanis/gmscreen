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
            
            // Validate data structure
            if (!isset($data['folders']) || !is_array($data['folders'])) {
                echo json_encode(['success' => false, 'error' => 'Invalid data structure']);
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
            
            // Validate nested structure
            foreach ($data['folders'] as $folder) {
                if (!isset($folder['id']) || !isset($folder['name'])) {
                    echo json_encode(['success' => false, 'error' => 'Invalid folder structure']);
                    exit;
                }
                
                if (isset($folder['subfolders']) && is_array($folder['subfolders'])) {
                    foreach ($folder['subfolders'] as $subfolder) {
                        if (!isset($subfolder['id']) || !isset($subfolder['name'])) {
                            echo json_encode(['success' => false, 'error' => 'Invalid subfolder structure']);
                            exit;
                        }
                        
                        if (isset($subfolder['templates']) && is_array($subfolder['templates'])) {
                            foreach ($subfolder['templates'] as $template) {
                                if (!isset($template['id'])) {
                                    echo json_encode(['success' => false, 'error' => 'Invalid template structure']);
                                    exit;
                                }
                                
                                // Sanitize rich text content
                                $richTextFields = ['origin', 'motive', 'fear', 'connections', 'change', 'impact_positive', 'impact_negative', 'story'];
                                foreach ($richTextFields as $field) {
                                    if (isset($template[$field])) {
                                        // Basic XSS protection - allow safe HTML tags
                                        $template[$field] = strip_tags($template[$field], '<p><br><strong><em><u><ul><li><span>');
                                    }
                                }
                            }
                        }
                    }
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
            
        case 'get_template_count':
            // Helper action to get template counts for statistics
            if (!file_exists($dataFile)) {
                echo json_encode(['success' => true, 'count' => 0]);
                exit;
            }
            
            $content = file_get_contents($dataFile);
            $data = json_decode($content, true);
            
            if (!$data || !isset($data['folders'])) {
                echo json_encode(['success' => true, 'count' => 0]);
                exit;
            }
            
            $totalTemplates = 0;
            foreach ($data['folders'] as $folder) {
                if (isset($folder['subfolders']) && is_array($folder['subfolders'])) {
                    foreach ($folder['subfolders'] as $subfolder) {
                        if (isset($subfolder['templates']) && is_array($subfolder['templates'])) {
                            $totalTemplates += count($subfolder['templates']);
                        }
                    }
                }
            }
            
            echo json_encode(['success' => true, 'count' => $totalTemplates]);
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
            'folders' => [],
            'metadata' => [
                'last_updated' => date('Y-m-d H:i:s'),
                'version' => '2.0.0'
            ]
        ];
        echo json_encode(['success' => true, 'data' => $defaultData]);
    }
    exit;
}