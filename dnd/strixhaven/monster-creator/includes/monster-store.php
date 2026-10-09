<?php
/**
 * Writing the monster creator's one data file, gm-monsters.json.
 *
 * This is the body of save-monster-data.php's save, moved here unchanged so the monster creator's
 * own Save and the key-guarded site upload (dnd/admin/site-upload) write the file the same way:
 * a backup first, a temporary file checked to be valid JSON, then an atomic rename, with the
 * backup put back if the write fails. Who may call it is the caller's business.
 *
 * Call these while holding FileLockManager's lock on the data file.
 */

require_once __DIR__ . '/monster-backup-helper.php';

/** The same check the monster creator's Save has always made. */
function monsterStoreValidate($data) {
    if (!is_array($data)) {
        return false;
    }

    // Required fields
    if (!isset($data['tabs']) || !isset($data['monsters'])) {
        return false;
    }

    // Tabs and monsters should be objects or arrays
    if (!is_array($data['tabs']) && !is_object($data['tabs'])) {
        return false;
    }

    if (!is_array($data['monsters']) && !is_object($data['monsters'])) {
        return false;
    }

    return true;
}

/**
 * Writes the whole data file. Throws on failure, after trying to put the backup back.
 *
 * @param array  $data       the whole of gm-monsters.json (tabs, monsters, abilityTabs)
 * @param string $user       who is saving, for the file's own note of it
 */
function monsterStoreWriteLocked($data, $dataFile, $dataDir, $backupType, $user) {
    try {
        // Create backup before saving
        $backupHelper = new MonsterBackupHelper($dataDir);
        if (file_exists($dataFile)) {
            $backupResult = $backupHelper->createBackup($dataFile, $backupType);
            if (!$backupResult['success']) {
                error_log('Monster Creator: Failed to create backup: ' . $backupResult['error']);
            }
        }

        // Add metadata
        $data['metadata'] = [
            'lastSaved' => date('Y-m-d H:i:s'),
            'version' => '1.0',
            'user' => $user
        ];

        // Validate data structure
        if (!monsterStoreValidate($data)) {
            throw new Exception('Invalid monster data structure');
        }

        // Encode data
        $jsonData = json_encode($data, JSON_PRETTY_PRINT);
        if ($jsonData === false) {
            throw new Exception('Failed to encode data: ' . json_last_error_msg());
        }

        // Atomic write: write to temp file first
        $tempFile = $dataFile . '.tmp.' . uniqid();

        // Write to temp file
        $bytesWritten = file_put_contents($tempFile, $jsonData, LOCK_EX);
        if ($bytesWritten === false) {
            throw new Exception('Failed to write temporary file');
        }

        // Verify the temp file is valid JSON
        $verifyContent = file_get_contents($tempFile);
        $verifyData = json_decode($verifyContent, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            unlink($tempFile);
            throw new Exception('Written data is not valid JSON');
        }

        // Atomic rename (this is atomic on most filesystems)
        if (!rename($tempFile, $dataFile)) {
            unlink($tempFile);
            throw new Exception('Failed to rename temporary file');
        }

        return true;

    } catch (Exception $e) {
        error_log('Monster Creator: Save error - ' . $e->getMessage());

        // Try to restore from backup if save failed
        if (isset($backupResult) && $backupResult['success']) {
            error_log('Monster Creator: Attempting to restore from backup after failed save');
            $backupHelper->restoreBackup($backupResult['backup_path'], $dataFile);
        }

        throw $e; // Re-throw to be handled by lock manager
    }
}

/** The data file as it stands, or the empty structure the monster creator starts from. */
function monsterStoreRead($dataFile) {
    if (!file_exists($dataFile)) {
        return ['tabs' => [], 'monsters' => [], 'abilityTabs' => ['common' => ['name' => 'Common', 'abilities' => []]]];
    }
    $content = file_get_contents($dataFile);
    if ($content === false) {
        throw new Exception('Failed to read file');
    }
    $data = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        throw new Exception('Invalid JSON: ' . json_last_error_msg());
    }
    return $data;
}
