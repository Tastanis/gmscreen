<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    header('Location: index.php');
    exit;
}

// Include required files
require_once 'includes/dashboard-backup-helper.php';

$dataDir = 'data';
$charactersFile = $dataDir . '/characters.json';

// Initialize backup system
$backupHelper = new DashboardBackupHelper($dataDir);

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    
    switch ($_POST['action'] ?? '') {
        case 'create_backup':
            $result = $backupHelper->createBackup($charactersFile, 'manual');
            echo json_encode($result);
            exit;
            
        case 'restore_backup':
            $backupPath = $_POST['backup_path'] ?? '';
            if (!$backupPath) {
                echo json_encode(['success' => false, 'error' => 'No backup path provided']);
                exit;
            }
            
            $result = $backupHelper->restoreBackup($backupPath, $charactersFile);
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
    }
}

// Get backup list and stats
$backups = $backupHelper->getBackups('characters.json');
$stats = $backupHelper->getStats();

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once 'version.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Recovery - Dashboard</title>
    <link rel="stylesheet" href="css/style.css">
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
        
        .recovery-nav a {
            padding: 8px 16px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            transition: background 0.2s;
        }
        
        .recovery-nav a:hover {
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
        
        .badge {
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .badge-primary {
            background: #007bff;
            color: white;
        }
        
        .badge-secondary {
            background: #6c757d;
            color: white;
        }
        
        .badge-success {
            background: #28a745;
            color: white;
        }
        
        .badge-warning {
            background: #ffc107;
            color: #212529;
        }
        
        .version-footer {
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
        }
        
        .version-info {
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="recovery-container">
        <div class="recovery-header">
            <h1>Character Data Recovery & Backup Management</h1>
            <div class="recovery-nav">
                <a href="dashboard.php">← Back to Dashboard</a>
                <a href="#" onclick="createManualBackup(); return false;">Create Backup Now</a>
            </div>
        </div>

        <!-- Status messages -->
        <div id="status-message"></div>

        <!-- Statistics -->
        <div class="recovery-section">
            <h2>Backup Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Total Backups</h3>
                    <div class="value"><?php echo $stats['total_backups'] ?? 0; ?></div>
                </div>
                <div class="stat-card">
                    <h3>Total Size</h3>
                    <div class="value"><?php echo $stats['total_size_mb'] ?? 0; ?> MB</div>
                </div>
                <div class="stat-card">
                    <h3>Recent Backups</h3>
                    <div class="value"><?php echo $stats['by_type']['recent'] ?? 0; ?></div>
                </div>
                <div class="stat-card">
                    <h3>Session Backups</h3>
                    <div class="value"><?php echo $stats['by_type']['session'] ?? 0; ?></div>
                </div>
                <div class="stat-card">
                    <h3>Daily Backups</h3>
                    <div class="value"><?php echo $stats['by_type']['daily'] ?? 0; ?></div>
                </div>
            </div>
        </div>

        <!-- Backup List -->
        <div class="recovery-section">
            <h2>Available Backups</h2>
            <?php if (empty($backups)): ?>
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                    </svg>
                    <p>No backups found. Backups are created automatically when character data is saved.</p>
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
                                <td><?php echo htmlspecialchars($backup['filename']); ?></td>
                                <td>
                                    <span class="badge badge-<?php 
                                        echo match($backup['type']) {
                                            'daily' => 'primary',
                                            'session' => 'warning',
                                            'recent' => 'success',
                                            default => 'secondary'
                                        }; 
                                    ?>">
                                        <?php echo ucfirst($backup['type']); ?>
                                    </span>
                                </td>
                                <td><?php echo $backup['date']; ?></td>
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

        <!-- Recovery Tips -->
        <div class="recovery-section">
            <h2>Backup System Information</h2>
            <div class="alert alert-info">
                <h4>3-Tier Backup Strategy:</h4>
                <ul>
                    <li><strong>Recent Backups:</strong> Created before each save for corruption recovery (1 backup, overwrites)</li>
                    <li><strong>Session Backups:</strong> Created every 10 minutes during active editing (2 rotating slots)</li>
                    <li><strong>Daily Backups:</strong> Manual backups for historical recovery (2 backups max)</li>
                </ul>
            </div>
            
            <div class="alert alert-warning">
                <h4>If you're experiencing data loss:</h4>
                <ul>
                    <li>Check if there are any recent backups in the list above</li>
                    <li>Use the "Verify" button to check if a backup is valid</li>
                    <li>Use the "Restore" button to recover from a backup</li>
                    <li>Recent backups are your best bet for latest changes</li>
                    <li>Session backups contain periodic saves from editing sessions</li>
                    <li>Daily backups are created when you manually create backups</li>
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
                
                const response = await fetch('dashboard-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('Character data backup created successfully!', 'success');
                    // Note: Page reload removed to preserve unsaved work
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
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
                
                const response = await fetch('dashboard-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.valid_json) {
                        showStatus(`Backup is valid! Contains ${result.records} character records. Size: ${(result.size / 1024).toFixed(2)} KB`, 'success');
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
            if (!confirm('Are you sure you want to restore from this backup? Current character data will be replaced.')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'restore_backup');
                formData.append('backup_path', backupPath);
                
                const response = await fetch('dashboard-recovery.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('Character data backup restored successfully!', 'success');
                    // Redirect to dashboard after 2 seconds
                    setTimeout(() => {
                        window.location.href = 'dashboard.php';
                    }, 2000);
                } else {
                    showStatus('Failed to restore backup: ' + result.error, 'danger');
                }
            } catch (error) {
                showStatus('Error restoring backup: ' + error.message, 'danger');
            }
        }
    </script>
</body>
</html>