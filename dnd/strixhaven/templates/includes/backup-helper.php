<?php
/**
 * Enhanced Backup System for Templates
 * Implements smart backup rotation with recent, session, and daily backups
 */

class TemplateBackupHelper {
    private $dataFile;
    private $backupDir;
    private $backupTypes = [
        'recent' => ['max' => 1, 'prefix' => 'recent'],
        'session' => ['max' => 2, 'prefix' => 'session'],
        'daily' => ['max' => 2, 'prefix' => 'daily']
    ];
    
    public function __construct() {
        $this->dataFile = dirname(__DIR__) . '/data/templates.json';
        $this->backupDir = dirname(__DIR__) . '/data/backups';
        
        // Ensure backup directory exists
        if (!is_dir($this->backupDir)) {
            mkdir($this->backupDir, 0755, true);
        }
    }
    
    /**
     * Create a backup based on type
     * @param string $type Backup type: 'auto', 'session', 'manual'
     * @return array Result with success status
     */
    public function createBackup($type = 'auto') {
        try {
            if (!file_exists($this->dataFile)) {
                return [
                    'success' => false,
                    'error' => 'No data file to backup'
                ];
            }
            
            $content = file_get_contents($this->dataFile);
            if (!$content) {
                return [
                    'success' => false,
                    'error' => 'Empty data file'
                ];
            }
            
            // Determine backup category based on type
            switch ($type) {
                case 'auto':
                    // Auto saves go to recent backup (overwrite)
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
        $backupFile = $this->backupDir . '/templates_recent_latest.json';
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_file' => basename($backupFile),
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
        $backupFile = $this->backupDir . "/templates_session_{$slotNumber}_{$timestamp}.json";
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_file' => basename($backupFile),
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
            $backupFile = $this->backupDir . "/templates_daily_{$date}.json";
        }
        
        if (file_put_contents($backupFile, $content, LOCK_EX) !== false) {
            return [
                'success' => true,
                'backup_file' => basename($backupFile),
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
        $pattern = $this->backupDir . "/templates_{$prefix}_*.json";
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
        $pattern = $this->backupDir . "/templates_daily_{$date}.json";
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
     * Restore from backup
     */
    public function restoreBackup($backupFile) {
        $backupPath = $this->backupDir . '/' . basename($backupFile);
        
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
        if (file_exists($this->dataFile)) {
            $currentContent = file_get_contents($this->dataFile);
            $this->createRecentBackup($currentContent);
        }
        
        // Restore the backup
        if (file_put_contents($this->dataFile, $content, LOCK_EX) !== false) {
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