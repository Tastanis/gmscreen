<?php
/**
 * Smart Backup System for GM Screen Data
 * Implements 3-tier backup strategy: Recent, Session, Daily
 * Based on Templates backup system architecture
 */

class GMBackupHelper {
    private $dataFile;
    private $backupDir;
    private $backupTypes = [
        'recent' => ['max' => 1, 'prefix' => 'recent'],
        'session' => ['max' => 2, 'prefix' => 'session'],
        'daily' => ['max' => 2, 'prefix' => 'daily']
    ];
    
    public function __construct($dataDir = null) {
        if ($dataDir === null) {
            $dataDir = __DIR__ . '/../data';
        }
        
        $this->dataFile = $dataDir . '/gm-tabs.json';
        $this->backupDir = $dataDir . '/backups';
        
        // Ensure backup directory exists
        if (!is_dir($this->backupDir)) {
            mkdir($this->backupDir, 0755, true);
        }
    }
    
    /**
     * Create a backup based on type
     * @param string $filePath Path to file to backup (optional, defaults to gm-tabs.json)
     * @param string $type Backup type: 'auto', 'session', 'manual', 'pre-save'
     * @return array Result with success status
     */
    public function createBackup($filePath = null, $type = 'auto') {
        try {
            // Use default file if not specified
            if ($filePath === null) {
                $filePath = $this->dataFile;
            }
            
            if (!file_exists($filePath)) {
                return [
                    'success' => false,
                    'error' => 'No data file to backup'
                ];
            }
            
            $content = file_get_contents($filePath);
            if (!$content) {
                return [
                    'success' => false,
                    'error' => 'Empty data file'
                ];
            }
            
            // Determine backup category based on type
            switch ($type) {
                case 'auto':
                case 'pre-save':
                    // Auto saves and pre-saves go to recent backup (overwrite)
                    return $this->createRecentBackup($content);
                    
                case 'session':
                    // Session backups rotate in their slots
                    return $this->createSessionBackup($content);
                    
                case 'manual':
                    // Manual backups are treated as daily backups
                    return $this->createDailyBackup($content);
                    
                default:
                    return $this->createRecentBackup($content);
            }
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => 'Backup exception: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Create recent backup (always overwrites)
     */
    private function createRecentBackup($content) {
        $backupFile = $this->backupDir . '/gm-tabs_recent_latest.json';
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_path' => $backupFile,
                'backup_name' => basename($backupFile),
                'type' => 'recent'
            ];
        }
        
        return [
            'success' => false,
            'error' => 'Failed to create recent backup'
        ];
    }
    
    /**
     * Create session backup (rotates between 2 slots)
     */
    private function createSessionBackup($content) {
        // Check existing session backups
        $sessionBackups = $this->getBackupsByType('session');
        
        // Determine which slot to use
        if (count($sessionBackups) < 2) {
            // Create new slot
            $slotNumber = count($sessionBackups) + 1;
        } else {
            // Overwrite oldest
            usort($sessionBackups, function($a, $b) {
                return filemtime($a['path']) - filemtime($b['path']);
            });
            
            // Extract slot number from oldest backup
            if (preg_match('/_session_(\d+)_/', $sessionBackups[0]['filename'], $matches)) {
                $slotNumber = $matches[1];
            } else {
                $slotNumber = 1;
            }
        }
        
        $timestamp = date('Y-m-d_H-i-s');
        $backupFile = $this->backupDir . "/gm-tabs_session_{$slotNumber}_{$timestamp}.json";
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_path' => $backupFile,
                'backup_name' => basename($backupFile),
                'type' => 'session',
                'slot' => $slotNumber
            ];
        }
        
        return [
            'success' => false,
            'error' => 'Failed to create session backup'
        ];
    }
    
    /**
     * Create daily backup
     */
    private function createDailyBackup($content) {
        // Check if we already have a daily backup for today
        $todayBackups = $this->getTodaysBackups();
        
        if (!empty($todayBackups)) {
            // Update today's backup instead of creating new
            $backupFile = $todayBackups[0]['path'];
        } else {
            // Create new daily backup
            $dailyBackups = $this->getBackupsByType('daily');
            
            // If we have 2 daily backups, remove the oldest
            if (count($dailyBackups) >= 2) {
                usort($dailyBackups, function($a, $b) {
                    return filemtime($a['path']) - filemtime($b['path']);
                });
                
                // Delete oldest
                unlink($dailyBackups[0]['path']);
            }
            
            $date = date('Y-m-d');
            $backupFile = $this->backupDir . "/gm-tabs_daily_{$date}.json";
        }
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_path' => $backupFile,
                'backup_name' => basename($backupFile),
                'type' => 'daily'
            ];
        }
        
        return [
            'success' => false,
            'error' => 'Failed to create daily backup'
        ];
    }
    
    /**
     * Get backups by type
     */
    private function getBackupsByType($type) {
        $prefix = $this->backupTypes[$type]['prefix'] ?? $type;
        $pattern = $this->backupDir . "/gm-tabs_{$prefix}_*.json";
        $files = glob($pattern);
        
        $backups = [];
        foreach ($files as $file) {
            $backups[] = [
                'path' => $file,
                'filename' => basename($file),
                'size' => filesize($file),
                'modified' => filemtime($file)
            ];
        }
        
        return $backups;
    }
    
    /**
     * Get today's daily backups
     */
    private function getTodaysBackups() {
        $date = date('Y-m-d');
        $pattern = $this->backupDir . "/gm-tabs_daily_{$date}.json";
        $files = glob($pattern);
        
        $backups = [];
        foreach ($files as $file) {
            $backups[] = [
                'path' => $file,
                'filename' => basename($file),
                'size' => filesize($file),
                'modified' => filemtime($file)
            ];
        }
        
        return $backups;
    }
    
    /**
     * List all backups
     */
    public function listBackups() {
        $allBackups = [];
        
        foreach ($this->backupTypes as $type => $config) {
            $backups = $this->getBackupsByType($type);
            foreach ($backups as &$backup) {
                $backup['type'] = $type;
                $backup['date'] = date('Y-m-d H:i:s', $backup['modified']);
            }
            $allBackups = array_merge($allBackups, $backups);
        }
        
        // Sort by date descending
        usort($allBackups, function($a, $b) {
            return $b['modified'] - $a['modified'];
        });
        
        return $allBackups;
    }
    
    /**
     * Restore from backup - compatible with old BackupSystem interface
     */
    public function restoreBackup($backupPath, $targetPath = null) {
        // Handle both old interface (backupPath, targetPath) and new interface (just backupFile)
        if ($targetPath === null) {
            $targetPath = $this->dataFile;
            // If backupPath is just a filename, construct full path
            if (!file_exists($backupPath)) {
                $backupPath = $this->backupDir . '/' . basename($backupPath);
            }
        }
        
        if (!file_exists($backupPath)) {
            return [
                'success' => false,
                'error' => 'Backup file not found'
            ];
        }
        
        // Validate backup file
        $content = file_get_contents($backupPath);
        $data = json_decode($content, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'error' => 'Invalid backup file'
            ];
        }
        
        // Create a recent backup of current state before restoring
        if (file_exists($targetPath)) {
            $currentContent = file_get_contents($targetPath);
            $this->createRecentBackup($currentContent);
        }
        
        // Restore the backup
        if (file_put_contents($targetPath, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'message' => 'Backup restored successfully'
            ];
        }
        
        return [
            'success' => false,
            'error' => 'Failed to restore backup'
        ];
    }
    
    /**
     * Get backup statistics - compatible with old BackupSystem interface
     */
    public function getStats() {
        try {
            $stats = [
                'total_backups' => 0,
                'total_size' => 0,
                'by_type' => [
                    'recent' => 0,
                    'session' => 0,
                    'daily' => 0
                ],
                'oldest_backup' => null,
                'newest_backup' => null
            ];
            
            $backups = glob($this->backupDir . '/gm-tabs_*.json');
            if (!$backups) {
                return $stats;
            }
            
            $stats['total_backups'] = count($backups);
            
            $oldestTime = PHP_INT_MAX;
            $newestTime = 0;
            
            foreach ($backups as $backup) {
                $stats['total_size'] += filesize($backup);
                $mtime = filemtime($backup);
                
                if ($mtime < $oldestTime) {
                    $oldestTime = $mtime;
                    $stats['oldest_backup'] = basename($backup);
                }
                
                if ($mtime > $newestTime) {
                    $newestTime = $mtime;
                    $stats['newest_backup'] = basename($backup);
                }
                
                // Count by type
                if (preg_match('/_(recent|session|daily)_/', basename($backup), $matches)) {
                    $stats['by_type'][$matches[1]]++;
                }
            }
            
            $stats['total_size_mb'] = round($stats['total_size'] / 1024 / 1024, 2);
            
            return $stats;
            
        } catch (Exception $e) {
            return [
                'error' => 'Failed to get backup statistics: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Get backups for a specific file - compatible with old BackupSystem interface
     */
    public function getBackups($fileName = 'gm-tabs.json') {
        return $this->listBackups();
    }
    
    /**
     * Verify backup integrity - compatible with old BackupSystem interface
     */
    public function verifyBackup($backupPath) {
        try {
            if (!file_exists($backupPath)) {
                return [
                    'success' => false,
                    'error' => 'Backup file does not exist'
                ];
            }
            
            // Check if it's a JSON file
            if (pathinfo($backupPath, PATHINFO_EXTENSION) === 'json') {
                $content = file_get_contents($backupPath);
                $data = json_decode($content, true);
                
                if (json_last_error() === JSON_ERROR_NONE) {
                    return [
                        'success' => true,
                        'valid_json' => true,
                        'size' => filesize($backupPath),
                        'records' => $this->countJsonRecords($data)
                    ];
                } else {
                    return [
                        'success' => false,
                        'valid_json' => false,
                        'error' => 'Invalid JSON: ' . json_last_error_msg()
                    ];
                }
            }
            
            // For non-JSON files, just check if readable
            return [
                'success' => is_readable($backupPath),
                'size' => filesize($backupPath)
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => 'Verification error: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Count records in JSON data
     */
    private function countJsonRecords($data) {
        if (!is_array($data)) {
            return 0;
        }
        
        $count = 0;
        foreach ($data as $key => $value) {
            if ($key !== 'metadata' && is_array($value)) {
                $count += count($value);
            }
        }
        
        return $count;
    }
    
    /**
     * Clean up old backups based on retention policy
     */
    public function cleanupOldBackups() {
        foreach ($this->backupTypes as $type => $config) {
            $backups = $this->getBackupsByType($type);
            
            if (count($backups) > $config['max']) {
                // Sort by date ascending (oldest first)
                usort($backups, function($a, $b) {
                    return $a['modified'] - $b['modified'];
                });
                
                // Remove excess backups
                $toRemove = count($backups) - $config['max'];
                for ($i = 0; $i < $toRemove; $i++) {
                    unlink($backups[$i]['path']);
                }
            }
        }
    }
}

// Helper function for backward compatibility
function createGMBackup($filePath, $type = 'auto') {
    $backupHelper = new GMBackupHelper();
    return $backupHelper->createBackup($filePath, $type);
}