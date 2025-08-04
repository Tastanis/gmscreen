<?php
/**
 * Backup System for GM Screen Data
 * Prevents data loss by creating automatic backups before saves
 */

class BackupSystem {
    private $backupDir;
    private $maxBackups;
    private $logFile;
    
    public function __construct($dataDir = 'data', $maxBackups = 5) {
        $this->backupDir = $dataDir . '/backups';
        $this->maxBackups = $maxBackups;
        $this->logFile = $dataDir . '/backup.log';
        
        // Ensure backup directory exists
        if (!is_dir($this->backupDir)) {
            mkdir($this->backupDir, 0755, true);
        }
    }
    
    /**
     * Create a backup of a file
     * @param string $filePath Path to the file to backup
     * @param string $type Type of backup (auto, manual, pre-save)
     * @return array Result with success status and backup path
     */
    public function createBackup($filePath, $type = 'auto') {
        try {
            if (!file_exists($filePath)) {
                return [
                    'success' => false,
                    'error' => 'Source file does not exist'
                ];
            }
            
            // Get file info
            $fileInfo = pathinfo($filePath);
            $fileName = $fileInfo['filename'];
            $fileExt = isset($fileInfo['extension']) ? '.' . $fileInfo['extension'] : '';
            
            // Create backup filename with timestamp
            $timestamp = date('Y-m-d_H-i-s');
            $backupName = "{$fileName}_{$type}_{$timestamp}{$fileExt}";
            $backupPath = $this->backupDir . '/' . $backupName;
            
            // Copy file to backup
            if (copy($filePath, $backupPath)) {
                // Log the backup
                $this->logBackup($filePath, $backupPath, $type, 'success');
                
                // Rotate old backups
                $this->rotateBackups($fileName . $fileExt);
                
                return [
                    'success' => true,
                    'backup_path' => $backupPath,
                    'backup_name' => $backupName,
                    'timestamp' => $timestamp
                ];
            } else {
                $error = 'Failed to copy file to backup location';
                $this->logBackup($filePath, $backupPath, $type, 'failed', $error);
                
                return [
                    'success' => false,
                    'error' => $error
                ];
            }
            
        } catch (Exception $e) {
            $error = 'Backup exception: ' . $e->getMessage();
            $this->logBackup($filePath, '', $type, 'error', $error);
            
            return [
                'success' => false,
                'error' => $error
            ];
        }
    }
    
    /**
     * Rotate old backups to maintain max backup limit
     * @param string $baseFileName Base filename to check for rotation
     */
    private function rotateBackups($baseFileName) {
        try {
            // Get all backups for this file
            $pattern = $this->backupDir . '/' . str_replace('.', '_*_????-??-??_??-??-??.', $baseFileName);
            $backups = glob($pattern);
            
            if ($backups && count($backups) > $this->maxBackups) {
                // Sort by modification time (oldest first)
                usort($backups, function($a, $b) {
                    return filemtime($a) - filemtime($b);
                });
                
                // Remove oldest backups
                $toRemove = count($backups) - $this->maxBackups;
                for ($i = 0; $i < $toRemove; $i++) {
                    if (unlink($backups[$i])) {
                        $this->logBackup($backups[$i], '', 'rotate', 'deleted');
                    }
                }
            }
        } catch (Exception $e) {
            $this->logBackup('', '', 'rotate', 'error', $e->getMessage());
        }
    }
    
    /**
     * Restore from a backup
     * @param string $backupPath Path to the backup file
     * @param string $targetPath Path where to restore the file
     * @return array Result with success status
     */
    public function restoreBackup($backupPath, $targetPath) {
        try {
            if (!file_exists($backupPath)) {
                return [
                    'success' => false,
                    'error' => 'Backup file does not exist'
                ];
            }
            
            // Create a backup of current file before restoring
            if (file_exists($targetPath)) {
                $this->createBackup($targetPath, 'pre-restore');
            }
            
            // Restore the backup
            if (copy($backupPath, $targetPath)) {
                $this->logBackup($backupPath, $targetPath, 'restore', 'success');
                
                return [
                    'success' => true,
                    'message' => 'File restored successfully from backup'
                ];
            } else {
                $error = 'Failed to restore file from backup';
                $this->logBackup($backupPath, $targetPath, 'restore', 'failed', $error);
                
                return [
                    'success' => false,
                    'error' => $error
                ];
            }
            
        } catch (Exception $e) {
            $error = 'Restore exception: ' . $e->getMessage();
            $this->logBackup($backupPath, $targetPath, 'restore', 'error', $error);
            
            return [
                'success' => false,
                'error' => $error
            ];
        }
    }
    
    /**
     * Get list of available backups for a file
     * @param string $fileName Name of the file to get backups for
     * @return array List of backups with details
     */
    public function getBackups($fileName) {
        try {
            $fileInfo = pathinfo($fileName);
            $baseName = $fileInfo['filename'];
            $ext = isset($fileInfo['extension']) ? '.' . $fileInfo['extension'] : '';
            
            $pattern = $this->backupDir . '/' . $baseName . '_*_????-??-??_??-??-??' . $ext;
            $backups = glob($pattern);
            
            if (!$backups) {
                return [];
            }
            
            $backupList = [];
            foreach ($backups as $backup) {
                $backupInfo = pathinfo($backup);
                $backupName = $backupInfo['basename'];
                
                // Parse backup filename
                if (preg_match('/^(.+)_(auto|manual|pre-save|pre-restore)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/', $backupName, $matches)) {
                    $backupList[] = [
                        'path' => $backup,
                        'name' => $backupName,
                        'type' => $matches[2],
                        'timestamp' => $matches[3],
                        'size' => filesize($backup),
                        'modified' => date('Y-m-d H:i:s', filemtime($backup))
                    ];
                }
            }
            
            // Sort by timestamp (newest first)
            usort($backupList, function($a, $b) {
                return strcmp($b['timestamp'], $a['timestamp']);
            });
            
            return $backupList;
            
        } catch (Exception $e) {
            $this->logBackup('', '', 'list', 'error', $e->getMessage());
            return [];
        }
    }
    
    /**
     * Verify backup integrity
     * @param string $backupPath Path to the backup file
     * @return array Verification result
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
     * @param mixed $data JSON data
     * @return int Number of records
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
     * Log backup operations
     * @param string $source Source file path
     * @param string $backup Backup file path
     * @param string $type Operation type
     * @param string $status Operation status
     * @param string $error Error message if any
     */
    private function logBackup($source, $backup, $type, $status, $error = '') {
        try {
            $logEntry = [
                'timestamp' => date('Y-m-d H:i:s'),
                'type' => $type,
                'status' => $status,
                'source' => $source,
                'backup' => $backup,
                'error' => $error,
                'user' => $_SESSION['user'] ?? 'unknown'
            ];
            
            $logLine = date('Y-m-d H:i:s') . ' | ' . 
                      $type . ' | ' . 
                      $status . ' | ' . 
                      basename($source) . ' | ' . 
                      basename($backup) . ' | ' . 
                      $error . ' | ' . 
                      ($logEntry['user']) . "\n";
            
            file_put_contents($this->logFile, $logLine, FILE_APPEND | LOCK_EX);
            
        } catch (Exception $e) {
            // Silently fail - don't break backup operation due to logging failure
        }
    }
    
    /**
     * Get backup statistics
     * @return array Statistics about backups
     */
    public function getStats() {
        try {
            $stats = [
                'total_backups' => 0,
                'total_size' => 0,
                'by_type' => [
                    'auto' => 0,
                    'manual' => 0,
                    'pre-save' => 0,
                    'pre-restore' => 0
                ],
                'oldest_backup' => null,
                'newest_backup' => null
            ];
            
            $backups = glob($this->backupDir . '/*.json');
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
                if (preg_match('/_((auto|manual|pre-save|pre-restore))_/', basename($backup), $matches)) {
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
}

// Helper function for easy backup creation
function createGMBackup($filePath, $type = 'auto') {
    $backupSystem = new BackupSystem();
    return $backupSystem->createBackup($filePath, $type);
}