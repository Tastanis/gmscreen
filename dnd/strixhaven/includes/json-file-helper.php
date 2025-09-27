<?php
/**
 * Utility helpers for safely loading and saving JSON data files with locking and backups.
 */

if (!function_exists('loadJsonFileWithBackup')) {
    /**
     * Load JSON data from disk with optional fallback to recent backups.
     *
     * @param string $filePath Absolute path to the JSON file.
     * @param array $options Optional settings: 'default' (callable|array), 'backup_prefix' (string).
     * @return mixed Decoded JSON data or provided default structure.
     */
    function loadJsonFileWithBackup($filePath, array $options = []) {
        $default = $options['default'] ?? [];
        $defaultValue = is_callable($default) ? call_user_func($default) : $default;

        if (!file_exists($filePath)) {
            return $defaultValue;
        }

        $content = @file_get_contents($filePath);
        if ($content !== false && $content !== '') {
            $data = json_decode($content, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $data;
            }
            error_log('JSON helper: Failed to decode ' . $filePath . ' - ' . json_last_error_msg());
        }

        if (!empty($options['backup_prefix'])) {
            $dir = dirname($filePath);
            $prefix = $options['backup_prefix'];
            $latest = $dir . DIRECTORY_SEPARATOR . $prefix . '_backup_latest.json';

            if (file_exists($latest)) {
                $backupContent = @file_get_contents($latest);
                if ($backupContent !== false) {
                    $data = json_decode($backupContent, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        return $data;
                    }
                }
            }

            $backups = glob($dir . DIRECTORY_SEPARATOR . $prefix . '_backup_*.json');
            if ($backups) {
                rsort($backups);
                foreach ($backups as $backupFile) {
                    $backupContent = @file_get_contents($backupFile);
                    if ($backupContent === false) {
                        continue;
                    }
                    $data = json_decode($backupContent, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        return $data;
                    }
                }
            }
        }

        return $defaultValue;
    }
}

if (!function_exists('modifyJsonFileWithLock')) {
    /**
     * Modify a JSON file while holding an exclusive lock, writing atomically with backups.
     *
     * The callback receives the current decoded data by reference and should return either a
     * custom payload or an array with optional keys:
     *  - 'result': value returned to caller.
     *  - 'save': bool indicating whether changes should be persisted (default true).
     *  - 'error': string to abort and return failure.
     *
     * @param string   $filePath Absolute path to the JSON file.
     * @param callable $callback Function that mutates the decoded data array.
     * @param array    $options  Optional settings:
     *                           - 'default' => callable|array default structure if file missing/invalid.
     *                           - 'backup_prefix' => string for backup filenames.
     *                           - 'lock_file' => explicit lock file path.
     *                           - 'max_backups' => int number of timestamped backups to keep.
     *                           - 'before_save' => callable executed before writing file.
     *                           - 'lock_attempts' => int attempts to acquire lock (default 50).
     *                           - 'lock_wait_us' => int microseconds to wait between attempts (default 100000).
     * @return array Result array with keys: 'success' (bool), optional 'result' and 'error'.
     */
    function modifyJsonFileWithLock($filePath, callable $callback, array $options = []) {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
                return ['success' => false, 'error' => 'Unable to create data directory'];
            }
        }

        $lockFile = $options['lock_file'] ?? ($filePath . '.lock');
        $lockAttempts = $options['lock_attempts'] ?? 50;
        $lockWait = $options['lock_wait_us'] ?? 100000;
        $default = $options['default'] ?? [];
        $backupPrefix = $options['backup_prefix'] ?? pathinfo($filePath, PATHINFO_FILENAME);
        $maxBackups = $options['max_backups'] ?? 5;

        $lockHandle = @fopen($lockFile, 'c+');
        if (!$lockHandle) {
            return ['success' => false, 'error' => 'Unable to open lock file'];
        }

        $acquired = false;
        $attempt = 0;
        while ($attempt < $lockAttempts) {
            $attempt++;
            if (@flock($lockHandle, LOCK_EX | LOCK_NB)) {
                $acquired = true;
                break;
            }
            usleep($lockWait);
        }

        if (!$acquired) {
            fclose($lockHandle);
            return ['success' => false, 'error' => 'Could not acquire file lock'];
        }

        try {
            $defaultValue = is_callable($default) ? call_user_func($default) : $default;
            $currentData = loadJsonFileWithBackup($filePath, [
                'default' => $defaultValue,
                'backup_prefix' => $backupPrefix,
            ]);

            if (!is_array($currentData)) {
                $currentData = $defaultValue;
            }

            $originalContent = null;
            if (file_exists($filePath)) {
                $originalContent = @file_get_contents($filePath);
            }

            $callbackResult = $callback($currentData);
            $saveChanges = true;
            $returnPayload = null;
            $errorMessage = null;

            if (is_array($callbackResult)) {
                if (array_key_exists('save', $callbackResult)) {
                    $saveChanges = (bool)$callbackResult['save'];
                }
                if (array_key_exists('result', $callbackResult)) {
                    $returnPayload = $callbackResult['result'];
                } else {
                    $returnPayload = $callbackResult;
                }
                if (isset($callbackResult['error'])) {
                    $errorMessage = $callbackResult['error'];
                }
            } else {
                $returnPayload = $callbackResult;
            }

            if ($errorMessage !== null) {
                return ['success' => false, 'error' => $errorMessage];
            }

            if (!$saveChanges) {
                return ['success' => true, 'result' => $returnPayload];
            }

            if (isset($options['before_save']) && is_callable($options['before_save'])) {
                call_user_func($options['before_save'], $currentData);
            }

            $jsonFlags = JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE;
            $jsonData = json_encode($currentData, $jsonFlags);
            if ($jsonData === false) {
                return ['success' => false, 'error' => 'Failed to encode JSON: ' . json_last_error_msg()];
            }

            if ($originalContent !== null && $originalContent !== '') {
                $latestBackup = $dir . DIRECTORY_SEPARATOR . $backupPrefix . '_backup_latest.json';
                @file_put_contents($latestBackup, $originalContent, LOCK_EX);

                $timestamped = $dir . DIRECTORY_SEPARATOR . $backupPrefix . '_backup_' . date('Ymd_His') . '.json';
                @file_put_contents($timestamped, $originalContent, LOCK_EX);

                $pattern = $dir . DIRECTORY_SEPARATOR . $backupPrefix . '_backup_*.json';
                $backups = glob($pattern);
                if ($backups && count($backups) > $maxBackups) {
                    sort($backups);
                    $excess = count($backups) - $maxBackups;
                    for ($i = 0; $i < $excess; $i++) {
                        if ($backups[$i] !== $latestBackup) {
                            @unlink($backups[$i]);
                        }
                    }
                }
            }

            $tempFile = $filePath . '.tmp.' . uniqid('', true);
            $bytes = @file_put_contents($tempFile, $jsonData, LOCK_EX);
            if ($bytes === false) {
                @unlink($tempFile);
                return ['success' => false, 'error' => 'Failed to write temporary file'];
            }

            $verifyContent = @file_get_contents($tempFile);
            if ($verifyContent === false) {
                @unlink($tempFile);
                return ['success' => false, 'error' => 'Failed to verify temporary file'];
            }

            json_decode($verifyContent, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                @unlink($tempFile);
                return ['success' => false, 'error' => 'Temporary file contains invalid JSON'];
            }

            if (!@rename($tempFile, $filePath)) {
                @unlink($tempFile);
                return ['success' => false, 'error' => 'Failed to replace original file'];
            }

            return ['success' => true, 'result' => $returnPayload];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        } finally {
            @flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }
    }
}
