<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Check if user is GM - restrict access
if (!$is_gm) {
    header('Location: ../../dashboard.php');
    exit;
}

// Include required files
require_once 'includes/monster-backup-helper.php';
require_once '../gm/includes/file-lock-manager.php';

$dataDir = __DIR__ . '/data/';
$dataFile = $dataDir . 'gm-monsters.json';

// Initialize backup system
$backupHelper = new MonsterBackupHelper($dataDir);

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    
    switch ($_POST['action'] ?? '') {
        case 'create_backup':
            $result = $backupHelper->createBackup($dataFile, 'manual');
            echo json_encode($result);
            exit;
            
        case 'restore_backup':
            $backupPath = $_POST['backup_path'] ?? '';
            if (!$backupPath) {
                echo json_encode(['success' => false, 'error' => 'No backup path provided']);
                exit;
            }
            
            $result = $backupHelper->restoreBackup($backupPath, $dataFile);
            echo json_encode($result);
            exit;
            
        case 'verify_backup':
            $backupPath = $_POST['backup_path'] ?? '';
            if (!$backupPath) {
                echo json_encode(['success' => false, 'error' => 'No backup path provided']);
                exit;
            }
            
            $result = $backupHelper->verifyBackup($backupPath);
            echo json_encode($result);
            exit;
            
        case 'get_locks':
            $lockManager = new FileLockManager($dataDir);
            $locks = $lockManager->getActiveLocks();
            echo json_encode(['success' => true, 'locks' => $locks]);
            exit;
            
        case 'force_release_locks':
            $lockManager = new FileLockManager($dataDir);
            $count = $lockManager->forceReleaseAllLocks(true);
            echo json_encode(['success' => true, 'released' => $count]);
            exit;
    }
}

// Get backup list and stats for GM monster file
$backups = $backupHelper->getBackups('gm-monsters.json');
$stats = $backupHelper->getStats();

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monster Data Recovery - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="css/monster-builder.css">
    <style>
        body {
            background: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
        }
        
        .recovery-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .recovery-header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .recovery-header h1 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        
        .recovery-nav {
            display: flex;
            gap: 10px;
        }
        
        .recovery-nav a, .recovery-nav button {
            padding: 8px 16px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .recovery-nav a:hover, .recovery-nav button:hover {
            background: #0056b3;
        }
        
        .recovery-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        .recovery-section h2 {
            margin: 0 0 15px 0;
            color: #2c3e50;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 10px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }
        
        .stat-card h3 {
            margin: 0 0 5px 0;
            font-size: 14px;
            color: #6c757d;
        }
        
        .stat-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .backup-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .backup-table th,
        .backup-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }
        
        .backup-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #495057;
        }
        
        .backup-table tr:hover {
            background: #f8f9fa;
        }
        
        .backup-actions {
            display: flex;
            gap: 5px;
        }
        
        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: opacity 0.2s;
        }
        
        .btn-primary {
            background: #007bff;
            color: white;
        }
        
        .btn-success {
            background: #28a745;
            color: white;
        }
        
        .btn-warning {
            background: #ffc107;
            color: #212529;
        }
        
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        
        .btn:hover {
            opacity: 0.8;
        }
        
        .alert {
            padding: 12px 20px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .alert-danger {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .lock-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        
        .lock-info {
            flex: 1;
        }
        
        .lock-info .file {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .lock-info .details {
            font-size: 13px;
            color: #6c757d;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #6c757d;
        }
        
        .empty-state svg {
            width: 64px;
            height: 64px;
            margin-bottom: 20px;
            opacity: 0.3;
        }
        
        .user-badge {
            background: #e9ecef;
            color: #495057;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="recovery-container">
        <div class="recovery-header">
            <h1>GM Monster Data Recovery</h1>
            <div style="margin-bottom: 15px;">
                <span class="user-badge">GM Access Only</span>
            </div>
            <div class="recovery-nav">
                <a href="index.php">← Back to Monster Creator</a>
                <button onclick="createManualBackup()">Create Backup Now</button>
            </div>
        </div>

        <!-- Status messages -->
        <div id="status-message"></div>

        <!-- File Info -->
        <div class="recovery-section">
            <h2>File Information</h2>
            <div class="alert alert-info">
                <strong>Data File:</strong> gm-monsters.json<br>
                <strong>Status:</strong> 
                <?php if (file_exists($dataFile)): ?>
                    <span style="color: #28a745;">✓ Exists</span> (<?php echo number_format(filesize($dataFile) / 1024, 2); ?> KB, Last modified: <?php echo date('Y-m-d H:i:s', filemtime($dataFile)); ?>)
                <?php else: ?>
                    <span style="color: #dc3545;">✗ Not found</span>
                <?php endif; ?>
            </div>
        </div>

        <!-- Statistics -->
        <div class="recovery-section">
            <h2>Backup Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>GM Monster Backups</h3>
                    <div class="value"><?php echo count($backups); ?></div>
                </div>
                <div class="stat-card">
                    <h3>Total System Backups</h3>
                    <div class="value"><?php echo $stats['total_backups'] ?? 0; ?></div>
                </div>
                <div class="stat-card">
                    <h3>Total Size</h3>
                    <div class="value"><?php echo $stats['total_size_mb'] ?? 0; ?> MB</div>
                </div>
                <div class="stat-card">
                    <h3>Manual Backups</h3>
                    <div class="value"><?php echo $stats['by_type']['manual'] ?? 0; ?></div>
                </div>
            </div>
        </div>

        <!-- Backup List -->
        <div class="recovery-section">
            <h2>GM Monster Backups</h2>
            <?php if (empty($backups)): ?>
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                    </svg>
                    <p>No backups found for GM monster data. Backups are created automatically when you save monsters.</p>
                </div>
            <?php else: ?>
                <table class="backup-table">
                    <thead>
                        <tr>
                            <th>Backup Name</th>
                            <th>Type</th>
                            <th>Created</th>
                            <th>Size</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($backups as $backup): ?>
                            <tr>
                                <td><?php echo htmlspecialchars($backup['name']); ?></td>
                                <td>
                                    <span class="badge badge-<?php echo $backup['type'] === 'manual' ? 'primary' : 'secondary'; ?>">
                                        <?php echo ucfirst($backup['type']); ?>
                                    </span>
                                </td>
                                <td><?php echo date('Y-m-d H:i:s', strtotime($backup['modified'])); ?></td>
                                <td><?php echo round($backup['size'] / 1024, 2); ?> KB</td>
                                <td>
                                    <div class="backup-actions">
                                        <button class="btn btn-primary" onclick="verifyBackup('<?php echo htmlspecialchars($backup['path']); ?>')">Verify</button>
                                        <button class="btn btn-success" onclick="restoreBackup('<?php echo htmlspecialchars($backup['path']); ?>')">Restore</button>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>

        <!-- File Locks -->
        <div class="recovery-section">
            <h2>Active File Locks</h2>
            <div id="locks-container">
                <div class="empty-state">
                    <p>Loading...</p>
                </div>
            </div>
            <button class="btn btn-danger" onclick="forceReleaseLocks()">Force Release All Locks</button>
        </div>

        <!-- Recovery Tips -->
        <div class="recovery-section">
            <h2>Recovery Tips</h2>
            <div class="alert alert-info">
                <h4>How the backup system works:</h4>
                <ul>
                    <li>Automatic backups are created before each save operation</li>
                    <li>Each user has their own separate backup files</li>
                    <li>The system keeps the last 5 backups for each user</li>
                    <li>You can create manual backups at any time</li>
                    <li>All backups are stored in the data/backups directory</li>
                </ul>
            </div>
            
            <div class="alert alert-warning">
                <h4>If you're experiencing data loss:</h4>
                <ul>
                    <li>Check if there are any recent backups in the list above</li>
                    <li>Use the "Verify" button to check if a backup contains your data</li>
                    <li>Use the "Restore" button to recover from a backup</li>
                    <li>Check browser console (F12) for any error messages</li>
                    <li>Make sure you're not opening the monster creator in multiple tabs</li>
                    <li>If you see unsaved changes notification, click "Recover Data"</li>
                </ul>
            </div>
        </div>
    </div>

    <!-- Version display -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <script>
        // Show status message
        function showStatus(message, type = 'info') {
            const container = document.getElementById('status-message');
            container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                container.innerHTML = '';
            }, 5000);
        }

        // Create manual backup
        async function createManualBackup() {
            try {
                const formData = new FormData();
                formData.append('action', 'create_backup');
                
                const response = await fetch('monster-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('Backup created successfully!', 'success');
                    // Reload page to show new backup
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showStatus('Failed to create backup: ' + result.error, 'danger');
                }
            } catch (error) {
                showStatus('Error creating backup: ' + error.message, 'danger');
            }
        }

        // Verify backup
        async function verifyBackup(backupPath) {
            try {
                const formData = new FormData();
                formData.append('action', 'verify_backup');
                formData.append('backup_path', backupPath);
                
                const response = await fetch('monster-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.valid_json) {
                        const monsterCount = result.records || 0;
                        showStatus(`Backup is valid! Contains ${monsterCount} records. Size: ${(result.size / 1024).toFixed(2)} KB`, 'success');
                    } else {
                        showStatus('Backup file is readable but not valid JSON', 'warning');
                    }
                } else {
                    showStatus('Backup verification failed: ' + result.error, 'danger');
                }
            } catch (error) {
                showStatus('Error verifying backup: ' + error.message, 'danger');
            }
        }

        // Restore backup
        async function restoreBackup(backupPath) {
            if (!confirm('Are you sure you want to restore from this backup? Current monster data will be replaced.')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'restore_backup');
                formData.append('backup_path', backupPath);
                
                const response = await fetch('monster-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('Backup restored successfully!', 'success');
                    // Redirect to monster creator after 2 seconds
                    setTimeout(() => {
                        window.location.href = 'index.php';
                    }, 2000);
                } else {
                    showStatus('Failed to restore backup: ' + result.error, 'danger');
                }
            } catch (error) {
                showStatus('Error restoring backup: ' + error.message, 'danger');
            }
        }

        // Load active locks
        async function loadLocks() {
            try {
                const formData = new FormData();
                formData.append('action', 'get_locks');
                
                const response = await fetch('monster-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                const container = document.getElementById('locks-container');
                
                if (result.success && result.locks.length > 0) {
                    container.innerHTML = result.locks.map(lock => `
                        <div class="lock-item">
                            <div class="lock-info">
                                <div class="file">${lock.file}</div>
                                <div class="details">
                                    Held by: ${lock.holder} | 
                                    PID: ${lock.pid} | 
                                    Age: ${lock.age}s
                                </div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div class="empty-state"><p>No active file locks</p></div>';
                }
            } catch (error) {
                console.error('Error loading locks:', error);
            }
        }

        // Force release all locks
        async function forceReleaseLocks() {
            if (!confirm('Are you sure you want to force release all locks? This should only be done if the system is stuck.')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'force_release_locks');
                
                const response = await fetch('monster-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus(`Released ${result.released} locks`, 'success');
                    loadLocks();
                } else {
                    showStatus('Failed to release locks', 'danger');
                }
            } catch (error) {
                showStatus('Error releasing locks: ' + error.message, 'danger');
            }
        }

        // Load locks on page load
        loadLocks();
        
        // Refresh locks every 5 seconds
        setInterval(loadLocks, 5000);
    </script>
</body>
</html>