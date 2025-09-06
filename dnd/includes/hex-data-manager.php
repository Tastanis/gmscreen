<?php
/**
 * Hex Data Manager
 * Handles all hex data operations with concurrency support
 */

require_once 'database-config.php';

class HexDataManager {
    private $pdo;
    private $lockDuration = 300; // 5 minutes in seconds
    private $autoSaveInterval = 30; // 30 seconds
    private $useDatabase = false;
    private $dataDir = '';
    
    public function __construct() {
        // Try to use database, fall back to JSON files if not available
        try {
            $this->pdo = DatabaseConfig::getConnection();
            $missingTables = DatabaseConfig::checkTables();
            
            if (empty($missingTables)) {
                $this->useDatabase = true;
            } else {
                // Try to create tables
                if (DatabaseConfig::createTables()) {
                    $this->useDatabase = true;
                } else {
                    $this->initFileStorage();
                }
            }
        } catch (Exception $e) {
            error_log("Database initialization failed, using file storage: " . $e->getMessage());
            $this->initFileStorage();
        }
    }
    
    private function initFileStorage() {
        $this->useDatabase = false;
        $this->dataDir = __DIR__ . '/../strixhaven/map/data/';
        
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0755, true);
        }
        
        // Create initial files if they don't exist
        $files = ['hexes.json', 'locks.json', 'changes.json'];
        foreach ($files as $file) {
            $filepath = $this->dataDir . $file;
            if (!file_exists($filepath)) {
                file_put_contents($filepath, json_encode([], JSON_PRETTY_PRINT));
            }
        }
    }
    
    /**
     * Get hex data by ID
     * @param string $hexId Hex identifier
     * @return array|null Hex data or null if not found
     */
    public function getHexData($hexId) {
        if ($this->useDatabase) {
            return $this->getHexDataFromDB($hexId);
        } else {
            return $this->getHexDataFromFile($hexId);
        }
    }
    
    private function getHexDataFromDB($hexId) {
        try {
            $stmt = $this->pdo->prepare("SELECT * FROM hex_data WHERE hex_id = ? AND is_deleted = FALSE");
            $stmt->execute([$hexId]);
            return $stmt->fetch();
        } catch (Exception $e) {
            error_log("Failed to get hex data from DB: " . $e->getMessage());
            return null;
        }
    }
    
    private function getHexDataFromFile($hexId) {
        try {
            $data = json_decode(file_get_contents($this->dataDir . 'hexes.json'), true);
            return $data[$hexId] ?? null;
        } catch (Exception $e) {
            error_log("Failed to get hex data from file: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Save hex data
     * @param string $hexId Hex identifier
     * @param array $data Hex data
     * @param string $userName User saving the data
     * @param string $sessionId Session ID
     * @param int|null $expectedVersion Expected version for optimistic locking
     * @return array Result with success status
     */
    public function saveHexData($hexId, $data, $userName, $sessionId, $expectedVersion = null) {
        if ($this->useDatabase) {
            return $this->saveHexDataToDB($hexId, $data, $userName, $sessionId, $expectedVersion);
        } else {
            return $this->saveHexDataToFile($hexId, $data, $userName, $sessionId, $expectedVersion);
        }
    }
    
    private function saveHexDataToDB($hexId, $data, $userName, $sessionId, $expectedVersion) {
        try {
            $this->pdo->beginTransaction();
            
            // Check if hex exists and get current version
            $currentData = $this->getHexDataFromDB($hexId);
            $currentVersion = $currentData['version_number'] ?? 0;
            
            // Optimistic locking check
            if ($expectedVersion !== null && $currentVersion !== $expectedVersion) {
                $this->pdo->rollback();
                return [
                    'success' => false,
                    'error' => 'Data has been modified by another user',
                    'conflict' => true,
                    'current_data' => $currentData
                ];
            }
            
            $newVersion = $currentVersion + 1;
            
            if ($currentData) {
                // Update existing hex
                $stmt = $this->pdo->prepare("
                    UPDATE hex_data SET
                        hex_name = ?, image_path = ?, custom_field_1 = ?, custom_field_2 = ?, 
                        custom_field_3 = ?, gm_notes = ?, player_notes = ?,
                        updated_by = ?, updated_at = CURRENT_TIMESTAMP, version_number = ?
                    WHERE hex_id = ?
                ");
                $stmt->execute([
                    $data['hex_name'] ?? null,
                    $data['image_path'] ?? null,
                    $data['custom_field_1'] ?? null,
                    $data['custom_field_2'] ?? null,
                    $data['custom_field_3'] ?? null,
                    $data['gm_notes'] ?? null,
                    $data['player_notes'] ?? null,
                    $userName,
                    $newVersion,
                    $hexId
                ]);
            } else {
                // Create new hex
                $stmt = $this->pdo->prepare("
                    INSERT INTO hex_data (hex_id, hex_name, image_path, custom_field_1, custom_field_2,
                                         custom_field_3, gm_notes, player_notes, created_by, updated_by, version_number)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $hexId,
                    $data['hex_name'] ?? null,
                    $data['image_path'] ?? null,
                    $data['custom_field_1'] ?? null,
                    $data['custom_field_2'] ?? null,
                    $data['custom_field_3'] ?? null,
                    $data['gm_notes'] ?? null,
                    $data['player_notes'] ?? null,
                    $userName,
                    $userName,
                    $newVersion
                ]);
            }
            
            // Log the change
            $this->logChange($hexId, 'bulk_update', json_encode($currentData), json_encode($data), $userName, $sessionId);
            
            $this->pdo->commit();
            return ['success' => true, 'version_number' => $newVersion];
            
        } catch (Exception $e) {
            $this->pdo->rollback();
            error_log("Failed to save hex data to DB: " . $e->getMessage());
            return ['success' => false, 'error' => 'Failed to save data'];
        }
    }
    
    private function saveHexDataToFile($hexId, $data, $userName, $sessionId, $expectedVersion) {
        try {
            $lockFile = $this->dataDir . 'hexes.lock';
            $fp = fopen($lockFile, 'w');
            
            if (!flock($fp, LOCK_EX)) {
                fclose($fp);
                return ['success' => false, 'error' => 'Could not acquire file lock'];
            }
            
            // Load existing data
            $hexesFile = $this->dataDir . 'hexes.json';
            $allData = json_decode(file_get_contents($hexesFile), true) ?: [];
            
            $currentData = $allData[$hexId] ?? null;
            $currentVersion = $currentData['version_number'] ?? 0;
            
            // Optimistic locking check
            if ($expectedVersion !== null && $currentVersion !== $expectedVersion) {
                flock($fp, LOCK_UN);
                fclose($fp);
                return [
                    'success' => false,
                    'error' => 'Data has been modified by another user',
                    'conflict' => true,
                    'current_data' => $currentData
                ];
            }
            
            $newVersion = $currentVersion + 1;
            
            // Update data
            $allData[$hexId] = array_merge($data, [
                'hex_id' => $hexId,
                'updated_by' => $userName,
                'updated_at' => date('Y-m-d H:i:s'),
                'version_number' => $newVersion
            ]);
            
            if (!$currentData) {
                $allData[$hexId]['created_by'] = $userName;
                $allData[$hexId]['created_at'] = date('Y-m-d H:i:s');
            }
            
            // Save to file
            file_put_contents($hexesFile, json_encode($allData, JSON_PRETTY_PRINT));
            
            // Log change to changes file
            $this->logChangeToFile($hexId, 'bulk_update', json_encode($currentData), json_encode($data), $userName, $sessionId);
            
            flock($fp, LOCK_UN);
            fclose($fp);
            
            return ['success' => true, 'version_number' => $newVersion];
            
        } catch (Exception $e) {
            if (isset($fp)) {
                flock($fp, LOCK_UN);
                fclose($fp);
            }
            error_log("Failed to save hex data to file: " . $e->getMessage());
            return ['success' => false, 'error' => 'Failed to save data'];
        }
    }
    
    /**
     * Acquire edit lock for a hex
     * @param string $hexId Hex identifier
     * @param string $userName User requesting lock
     * @param string $sessionId Session ID
     * @return array Result with success status
     */
    public function acquireEditLock($hexId, $userName, $sessionId) {
        if ($this->useDatabase) {
            return $this->acquireEditLockDB($hexId, $userName, $sessionId);
        } else {
            return $this->acquireEditLockFile($hexId, $userName, $sessionId);
        }
    }
    
    private function acquireEditLockDB($hexId, $userName, $sessionId) {
        try {
            $this->pdo->beginTransaction();
            
            // Clean up expired locks first
            $this->cleanupExpiredLocks();
            
            // Check if hex is already locked by someone else
            $stmt = $this->pdo->prepare("
                SELECT locked_by, session_id, expires_at 
                FROM hex_edit_locks 
                WHERE hex_id = ? AND expires_at > NOW()
            ");
            $stmt->execute([$hexId]);
            $existingLock = $stmt->fetch();
            
            if ($existingLock && $existingLock['session_id'] !== $sessionId) {
                $this->pdo->rollback();
                return [
                    'success' => false,
                    'error' => 'Hex is currently being edited by ' . $existingLock['locked_by'],
                    'locked_by' => $existingLock['locked_by'],
                    'expires_at' => $existingLock['expires_at']
                ];
            }
            
            // Acquire or refresh lock
            $expiresAt = date('Y-m-d H:i:s', time() + $this->lockDuration);
            $stmt = $this->pdo->prepare("
                INSERT INTO hex_edit_locks (hex_id, locked_by, session_id, expires_at)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    locked_by = VALUES(locked_by),
                    session_id = VALUES(session_id),
                    lock_timestamp = CURRENT_TIMESTAMP,
                    expires_at = VALUES(expires_at)
            ");
            $stmt->execute([$hexId, $userName, $sessionId, $expiresAt]);
            
            $this->pdo->commit();
            return ['success' => true, 'expires_at' => $expiresAt];
            
        } catch (Exception $e) {
            $this->pdo->rollback();
            error_log("Lock acquisition failed: " . $e->getMessage());
            return ['success' => false, 'error' => 'Failed to acquire edit lock'];
        }
    }
    
    private function acquireEditLockFile($hexId, $userName, $sessionId) {
        try {
            $locksFile = $this->dataDir . 'locks.json';
            $lockFile = $this->dataDir . 'locks.lock';
            $fp = fopen($lockFile, 'w');
            
            if (!flock($fp, LOCK_EX)) {
                fclose($fp);
                return ['success' => false, 'error' => 'Could not acquire file lock'];
            }
            
            $locks = json_decode(file_get_contents($locksFile), true) ?: [];
            
            // Clean expired locks
            $now = time();
            $locks = array_filter($locks, function($lock) use ($now) {
                return $lock['expires_at'] > $now;
            });
            
            // Check existing lock
            if (isset($locks[$hexId]) && $locks[$hexId]['session_id'] !== $sessionId) {
                flock($fp, LOCK_UN);
                fclose($fp);
                return [
                    'success' => false,
                    'error' => 'Hex is currently being edited by ' . $locks[$hexId]['locked_by'],
                    'locked_by' => $locks[$hexId]['locked_by'],
                    'expires_at' => date('Y-m-d H:i:s', $locks[$hexId]['expires_at'])
                ];
            }
            
            // Set lock
            $expiresAt = $now + $this->lockDuration;
            $locks[$hexId] = [
                'locked_by' => $userName,
                'session_id' => $sessionId,
                'expires_at' => $expiresAt,
                'timestamp' => $now
            ];
            
            file_put_contents($locksFile, json_encode($locks, JSON_PRETTY_PRINT));
            
            flock($fp, LOCK_UN);
            fclose($fp);
            
            return ['success' => true, 'expires_at' => date('Y-m-d H:i:s', $expiresAt)];
            
        } catch (Exception $e) {
            if (isset($fp)) {
                flock($fp, LOCK_UN);
                fclose($fp);
            }
            error_log("Lock acquisition failed: " . $e->getMessage());
            return ['success' => false, 'error' => 'Failed to acquire edit lock'];
        }
    }
    
    /**
     * Release edit lock for a hex
     * @param string $hexId Hex identifier
     * @param string $sessionId Session ID
     * @return bool Success status
     */
    public function releaseEditLock($hexId, $sessionId) {
        if ($this->useDatabase) {
            return $this->releaseEditLockDB($hexId, $sessionId);
        } else {
            return $this->releaseEditLockFile($hexId, $sessionId);
        }
    }
    
    private function releaseEditLockDB($hexId, $sessionId) {
        try {
            $stmt = $this->pdo->prepare("DELETE FROM hex_edit_locks WHERE hex_id = ? AND session_id = ?");
            return $stmt->execute([$hexId, $sessionId]);
        } catch (Exception $e) {
            error_log("Lock release failed: " . $e->getMessage());
            return false;
        }
    }
    
    private function releaseEditLockFile($hexId, $sessionId) {
        try {
            $locksFile = $this->dataDir . 'locks.json';
            $lockFile = $this->dataDir . 'locks.lock';
            $fp = fopen($lockFile, 'w');
            
            if (!flock($fp, LOCK_EX)) {
                fclose($fp);
                return false;
            }
            
            $locks = json_decode(file_get_contents($locksFile), true) ?: [];
            
            if (isset($locks[$hexId]) && $locks[$hexId]['session_id'] === $sessionId) {
                unset($locks[$hexId]);
                file_put_contents($locksFile, json_encode($locks, JSON_PRETTY_PRINT));
            }
            
            flock($fp, LOCK_UN);
            fclose($fp);
            
            return true;
            
        } catch (Exception $e) {
            if (isset($fp)) {
                flock($fp, LOCK_UN);
                fclose($fp);
            }
            error_log("Lock release failed: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Get all hex data with filters
     * @param array $filters Optional filters
     * @return array Array of hex data
     */
    public function getAllHexData($filters = []) {
        if ($this->useDatabase) {
            return $this->getAllHexDataFromDB($filters);
        } else {
            return $this->getAllHexDataFromFile($filters);
        }
    }
    
    private function getAllHexDataFromDB($filters) {
        try {
            $sql = "SELECT * FROM hex_data WHERE is_deleted = FALSE";
            $params = [];
            
            if (!empty($filters['has_data'])) {
                $sql .= " AND (hex_name IS NOT NULL OR image_path IS NOT NULL OR 
                         custom_field_1 IS NOT NULL OR custom_field_2 IS NOT NULL OR 
                         custom_field_3 IS NOT NULL OR gm_notes IS NOT NULL OR 
                         player_notes IS NOT NULL)";
            }
            
            if (!empty($filters['updated_after'])) {
                $sql .= " AND updated_at > ?";
                $params[] = $filters['updated_after'];
            }
            
            $sql .= " ORDER BY updated_at DESC";
            
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
            
        } catch (Exception $e) {
            error_log("Failed to get all hex data from DB: " . $e->getMessage());
            return [];
        }
    }
    
    private function getAllHexDataFromFile($filters) {
        try {
            $data = json_decode(file_get_contents($this->dataDir . 'hexes.json'), true) ?: [];
            
            if (!empty($filters['has_data'])) {
                $data = array_filter($data, function($hex) {
                    return !empty($hex['hex_name']) || !empty($hex['image_path']) || 
                           !empty($hex['custom_field_1']) || !empty($hex['custom_field_2']) || 
                           !empty($hex['custom_field_3']) || !empty($hex['gm_notes']) || 
                           !empty($hex['player_notes']);
                });
            }
            
            if (!empty($filters['updated_after'])) {
                $cutoff = strtotime($filters['updated_after']);
                $data = array_filter($data, function($hex) use ($cutoff) {
                    return isset($hex['updated_at']) && strtotime($hex['updated_at']) > $cutoff;
                });
            }
            
            // Convert to indexed array and sort by updated_at
            $result = array_values($data);
            usort($result, function($a, $b) {
                return strtotime($b['updated_at'] ?? '1970-01-01') - strtotime($a['updated_at'] ?? '1970-01-01');
            });
            
            return $result;
            
        } catch (Exception $e) {
            error_log("Failed to get all hex data from file: " . $e->getMessage());
            return [];
        }
    }
    
    private function logChange($hexId, $fieldName, $oldValue, $newValue, $userName, $sessionId) {
        if (!$this->useDatabase) return;
        
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO hex_change_log (hex_id, field_name, old_value, new_value, changed_by, session_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$hexId, $fieldName, $oldValue, $newValue, $userName, $sessionId]);
        } catch (Exception $e) {
            error_log("Failed to log change: " . $e->getMessage());
        }
    }
    
    private function logChangeToFile($hexId, $fieldName, $oldValue, $newValue, $userName, $sessionId) {
        try {
            $changesFile = $this->dataDir . 'changes.json';
            $changes = json_decode(file_get_contents($changesFile), true) ?: [];
            
            $changes[] = [
                'hex_id' => $hexId,
                'field_name' => $fieldName,
                'old_value' => $oldValue,
                'new_value' => $newValue,
                'changed_by' => $userName,
                'session_id' => $sessionId,
                'timestamp' => date('Y-m-d H:i:s')
            ];
            
            // Keep only last 1000 changes to prevent file from growing too large
            if (count($changes) > 1000) {
                $changes = array_slice($changes, -1000);
            }
            
            file_put_contents($changesFile, json_encode($changes, JSON_PRETTY_PRINT));
        } catch (Exception $e) {
            error_log("Failed to log change to file: " . $e->getMessage());
        }
    }
    
    private function cleanupExpiredLocks() {
        if ($this->useDatabase) {
            try {
                $stmt = $this->pdo->prepare("DELETE FROM hex_edit_locks WHERE expires_at <= NOW()");
                $stmt->execute();
            } catch (Exception $e) {
                error_log("Failed to cleanup expired locks: " . $e->getMessage());
            }
        }
    }
    
    /**
     * Check if system is using database
     * @return bool True if using database
     */
    public function isUsingDatabase() {
        return $this->useDatabase;
    }
    
    /**
     * Get system status
     * @return array System status information
     */
    public function getSystemStatus() {
        $status = [
            'storage_type' => $this->useDatabase ? 'database' : 'files',
            'data_directory' => $this->dataDir,
            'lock_duration' => $this->lockDuration
        ];
        
        if ($this->useDatabase) {
            $status['database_config'] = DatabaseConfig::getConfig();
            $status['missing_tables'] = DatabaseConfig::checkTables();
        }
        
        return $status;
    }
}
?>