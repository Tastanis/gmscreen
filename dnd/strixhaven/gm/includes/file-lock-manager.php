<?php
/**
 * File Lock Manager for preventing race conditions
 * Ensures only one process can modify critical files at a time
 */

class FileLockManager {
    private $lockDir;
    private $lockTimeout;
    private $maxWaitTime;
    
    public function __construct($dataDir = 'data', $lockTimeout = 30, $maxWaitTime = 5) {
        $this->lockDir = $dataDir . '/locks';
        $this->lockTimeout = $lockTimeout; // Seconds before a lock is considered stale
        $this->maxWaitTime = $maxWaitTime; // Maximum seconds to wait for a lock
        
        // Ensure lock directory exists
        if (!is_dir($this->lockDir)) {
            mkdir($this->lockDir, 0755, true);
        }
        
        // Clean up stale locks on initialization
        $this->cleanupStaleLocks();
    }
    
    /**
     * Acquire a lock for a file
     * @param string $filePath Path to the file to lock
     * @param int $maxAttempts Maximum number of attempts to acquire lock
     * @return array Result with success status and lock info
     */
    public function acquireLock($filePath, $maxAttempts = 50) {
        $lockFile = $this->getLockFilePath($filePath);
        $startTime = microtime(true);
        $attempt = 0;
        
        while ($attempt < $maxAttempts) {
            $attempt++;
            
            // Check if lock exists and is still valid
            if (file_exists($lockFile)) {
                $lockData = $this->readLockFile($lockFile);
                
                if ($lockData && $this->isLockValid($lockData)) {
                    // Lock is held by another process
                    $elapsedTime = microtime(true) - $startTime;
                    
                    if ($elapsedTime >= $this->maxWaitTime) {
                        return [
                            'success' => false,
                            'error' => 'Timeout waiting for lock',
                            'holder' => $lockData['holder'] ?? 'unknown',
                            'wait_time' => $elapsedTime
                        ];
                    }
                    
                    // Wait a bit before trying again
                    usleep(100000); // 100ms
                    continue;
                } else {
                    // Lock is stale, remove it
                    @unlink($lockFile);
                }
            }
            
            // Try to create lock file atomically
            $lockData = [
                'pid' => getmypid(),
                'holder' => $_SESSION['user'] ?? 'system',
                'timestamp' => time(),
                'file' => basename($filePath),
                'request_id' => uniqid('lock_', true)
            ];
            
            $lockContent = json_encode($lockData);
            
            // Use atomic file creation with O_EXCL flag
            $handle = @fopen($lockFile, 'x');
            if ($handle !== false) {
                fwrite($handle, $lockContent);
                fclose($handle);
                
                return [
                    'success' => true,
                    'lock_file' => $lockFile,
                    'request_id' => $lockData['request_id'],
                    'attempts' => $attempt
                ];
            }
            
            // Failed to create lock, another process got it first
            usleep(50000); // 50ms
        }
        
        return [
            'success' => false,
            'error' => 'Failed to acquire lock after ' . $maxAttempts . ' attempts',
            'elapsed_time' => microtime(true) - $startTime
        ];
    }
    
    /**
     * Release a lock
     * @param string $lockFile Path to the lock file
     * @param string $requestId Request ID that acquired the lock
     * @return bool True if lock was released, false otherwise
     */
    public function releaseLock($lockFile, $requestId = null) {
        if (!file_exists($lockFile)) {
            return true; // Lock doesn't exist, consider it released
        }
        
        // Verify ownership if request ID provided
        if ($requestId !== null) {
            $lockData = $this->readLockFile($lockFile);
            if ($lockData && isset($lockData['request_id']) && $lockData['request_id'] !== $requestId) {
                error_log('GM Screen: Attempted to release lock owned by another request');
                return false;
            }
        }
        
        return @unlink($lockFile);
    }
    
    /**
     * Execute a function with file locking
     * @param string $filePath File to lock
     * @param callable $callback Function to execute while holding the lock
     * @return array Result with success status and callback result
     */
    public function withLock($filePath, callable $callback) {
        $lockResult = $this->acquireLock($filePath);
        
        if (!$lockResult['success']) {
            return [
                'success' => false,
                'error' => 'Failed to acquire lock: ' . $lockResult['error']
            ];
        }
        
        try {
            // Execute the callback
            $result = $callback();
            
            return [
                'success' => true,
                'result' => $result
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => 'Error during locked operation: ' . $e->getMessage()
            ];
            
        } finally {
            // Always release the lock
            $this->releaseLock($lockResult['lock_file'], $lockResult['request_id']);
        }
    }
    
    /**
     * Get lock file path for a given file
     * @param string $filePath Original file path
     * @return string Lock file path
     */
    private function getLockFilePath($filePath) {
        $fileName = basename($filePath);
        $hash = md5($filePath);
        return $this->lockDir . '/' . $fileName . '.' . $hash . '.lock';
    }
    
    /**
     * Read lock file data
     * @param string $lockFile Path to lock file
     * @return array|null Lock data or null if invalid
     */
    private function readLockFile($lockFile) {
        if (!file_exists($lockFile)) {
            return null;
        }
        
        $content = @file_get_contents($lockFile);
        if ($content === false) {
            return null;
        }
        
        $data = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        
        return $data;
    }
    
    /**
     * Check if a lock is still valid
     * @param array $lockData Lock data
     * @return bool True if lock is valid, false if stale
     */
    private function isLockValid($lockData) {
        if (!isset($lockData['timestamp'])) {
            return false;
        }
        
        $age = time() - $lockData['timestamp'];
        return $age < $this->lockTimeout;
    }
    
    /**
     * Clean up stale lock files
     */
    private function cleanupStaleLocks() {
        try {
            $lockFiles = glob($this->lockDir . '/*.lock');
            if (!$lockFiles) {
                return;
            }
            
            foreach ($lockFiles as $lockFile) {
                $lockData = $this->readLockFile($lockFile);
                
                if (!$lockData || !$this->isLockValid($lockData)) {
                    @unlink($lockFile);
                }
            }
        } catch (Exception $e) {
            error_log('GM Screen: Error cleaning up stale locks: ' . $e->getMessage());
        }
    }
    
    /**
     * Get information about current locks
     * @return array List of active locks
     */
    public function getActiveLocks() {
        $locks = [];
        
        try {
            $lockFiles = glob($this->lockDir . '/*.lock');
            if (!$lockFiles) {
                return $locks;
            }
            
            foreach ($lockFiles as $lockFile) {
                $lockData = $this->readLockFile($lockFile);
                
                if ($lockData && $this->isLockValid($lockData)) {
                    $lockData['lock_file'] = basename($lockFile);
                    $lockData['age'] = time() - $lockData['timestamp'];
                    $locks[] = $lockData;
                }
            }
        } catch (Exception $e) {
            error_log('GM Screen: Error getting active locks: ' . $e->getMessage());
        }
        
        return $locks;
    }
    
    /**
     * Force release all locks (emergency use only)
     * @param bool $confirm Must be true to execute
     * @return int Number of locks released
     */
    public function forceReleaseAllLocks($confirm = false) {
        if ($confirm !== true) {
            return 0;
        }
        
        $count = 0;
        
        try {
            $lockFiles = glob($this->lockDir . '/*.lock');
            if (!$lockFiles) {
                return $count;
            }
            
            foreach ($lockFiles as $lockFile) {
                if (@unlink($lockFile)) {
                    $count++;
                }
            }
        } catch (Exception $e) {
            error_log('GM Screen: Error force releasing locks: ' . $e->getMessage());
        }
        
        return $count;
    }
}