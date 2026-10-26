<?php
/**
 * The heroes' campaign data (data/characters.json): reading and writing it safely, in one place.
 *
 * Moved out of dashboard.php (October 2026) so the dashboard, the Projects and Relationships screens
 * (api/campaign.php) and the chat's project-roll award all use the same backup-keeping save:
 *   - one lock file (data/characters.lock, also used by the Students page when it syncs relationships);
 *   - before every write: characters_backup_latest.json, a timestamped copy (last 5 kept) and the
 *     dashboard backup helper's "recent" backup (data/backups/characters_recent_latest.json);
 *   - an all-empty save never replaces real data; the write goes to a temp file, is checked, then renamed.
 *
 * Stored value types are unchanged: points are strings ("12"), points_history is a list of whole-number totals.
 */

require_once __DIR__ . '/players.php';
require_once __DIR__ . '/dashboard-backup-helper.php';
require_once __DIR__ . '/../strixhaven/includes/json-file-helper.php';

/** The data folder. Tests point it somewhere else with character_data_set_dir(). */
function character_data_dir(): string
{
    return character_data_set_dir(null);
}

function character_data_set_dir(?string $dir): string
{
    static $current = null;
    if ($dir !== null) {
        $current = rtrim($dir, '/\\');
    }
    if ($current === null) {
        $current = __DIR__ . '/../data';
    }
    return $current;
}

function character_data_file(): string
{
    return character_data_dir() . '/characters.json';
}

/** Cheap change marker for polling: changes whenever characters.json is rewritten. */
function character_data_revision(): string
{
    $file = character_data_file();
    clearstatcache(true, $file);
    if (!is_file($file)) {
        return '0';
    }
    return filemtime($file) . '-' . filesize($file);
}

/** A blank hero, as the dashboard has always created one. */
function character_data_blank_hero(): array
{
    return array(
        'character' => array(
            'character_name' => '',
            'player_name' => '',
            'class' => '',
            'race' => '',
            'level' => '',
            'college' => '',
            'minor' => '',
            'extra_curricular' => '',
            'boon' => '',
            'wealth' => '',
            'renown' => '',
            'other' => '',
            'portrait' => ''
        ),
        'current_classes' => array(
            'class_name' => '',
            'test_1_grade' => '',
            'test_2_grade' => '',
            'project_1_grade' => '',
            'project_2_grade' => '',
            'overall_grade' => '',
            'test_buffs' => ''
        ),
        'past_classes' => array(),
        'relationships' => array(),
        'projects' => array(),
        'clubs' => array(
            array('name' => '', 'people' => '', 'bonuses' => '', 'other' => '')
        ),
        'job' => array(
            'job_title' => '',
            'job_satisfaction' => '',
            'wages' => '',
            'coworkers' => ''
        )
    );
}

/** Whether any hero has a character name (real data rather than empty defaults). */
function character_data_has_real_data($data): bool
{
    if (!is_array($data)) {
        return false;
    }
    foreach ($data as $charData) {
        if (isset($charData['character']['character_name']) && !empty($charData['character']['character_name'])) {
            return true;
        }
    }
    return false;
}

// Function to load character data
function loadCharacterData() {
    $dataFile = character_data_file();
    $backupFile = character_data_dir() . '/characters_backup_latest.json';

    // If file exists, try to load it
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);

        // Check if file is not empty
        if (empty($content)) {
            error_log("ERROR: characters.json exists but is empty!");
            // Try to load from backup
            if (file_exists($backupFile)) {
                $content = file_get_contents($backupFile);
                error_log("Attempting to recover from backup file");
            } else {
                die("CRITICAL ERROR: Character data file is empty and no backup found. Please restore from a manual backup.");
            }
        }

        // Try to decode JSON
        $data = json_decode($content, true);

        // Check for JSON errors
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("ERROR: JSON decode failed - " . json_last_error_msg());
            error_log("File content length: " . strlen($content));

            // Try to load from backup
            if (file_exists($backupFile)) {
                $backupContent = file_get_contents($backupFile);
                $data = json_decode($backupContent, true);
                if (json_last_error() === JSON_ERROR_NONE && $data) {
                    error_log("Successfully recovered from backup file");
                    // Restore the backup as main file
                    file_put_contents($dataFile, $backupContent, LOCK_EX);
                    return $data;
                }
            }

            die("CRITICAL ERROR: Character data file is corrupted. JSON Error: " . json_last_error_msg() . ". Please restore from a manual backup.");
        }

        // Validate that we have actual character data
        if ($data && is_array($data) && !empty($data)) {
            if (!character_data_has_real_data($data)) {
                error_log("WARNING: Character data exists but appears to be all defaults. This might indicate data loss.");
            }
            return $data;
        }
    }

    // Only create default data if file doesn't exist at all (fresh install)
    if (!file_exists($dataFile)) {
        error_log("Creating new character data file (first time setup)");
        $default_data = array();
        foreach (players_ids() as $char) {
            $default_data[$char] = character_data_blank_hero();
        }
        return $default_data;
    }

    // This should never be reached
    die("CRITICAL ERROR: Unexpected state in loadCharacterData()");
}

// Function to validate field data
function validateFieldData($section, $field, $value) {
    // Basic validation - prevent obviously bad data
    if ($value === null || $value === 'undefined' || $value === 'null') {
        return '';
    }

    // Strip any HTML tags for security
    $value = strip_tags($value);

    // Field-specific validation
    switch ($section) {
        case 'character':
            if ($field === 'character_name' && strlen($value) > 100) {
                return substr($value, 0, 100);
            }
            break;
        case 'relationships':
            if ($field === 'points' && !is_numeric($value) && !empty($value)) {
                return '0';
            }
            break;
        case 'projects':
            if (($field === 'points_earned' || $field === 'total_points') && !is_numeric($value) && !empty($value)) {
                return '0';
            }
            break;
    }

    return $value;
}

/** Takes the characters.json lock (5 second wait). Returns the handle, or null. */
function character_data_lock()
{
    $dir = character_data_dir();
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $lockHandle = fopen($dir . '/characters.lock', 'c+');
    if (!$lockHandle) {
        error_log("ERROR: Failed to create lock file");
        return null;
    }
    for ($attempts = 0; $attempts < 50; $attempts++) { // 5 second timeout (50 * 100ms)
        if (flock($lockHandle, LOCK_EX | LOCK_NB)) {
            return $lockHandle;
        }
        usleep(100000);
    }
    fclose($lockHandle);
    error_log("ERROR: Failed to acquire lock for character save after 5 seconds");
    return null;
}

function character_data_unlock($lockHandle): void
{
    if ($lockHandle) {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

/** Backups, then the atomic write. The caller holds the lock. */
function character_data_write_locked($data): bool
{
    $dir = character_data_dir();
    $dataFile = $dir . '/characters.json';
    $tempFile = $dir . '/characters_temp.json';
    $backupFile = $dir . '/characters_backup_latest.json';

    // Validate data before saving
    if (!is_array($data) || empty($data)) {
        error_log("ERROR: Attempted to save invalid character data");
        return false;
    }

    // If current file has real data but new data is all empty, reject the save
    if (!character_data_has_real_data($data) && file_exists($dataFile)) {
        $currentContent = file_get_contents($dataFile);
        if ($currentContent) {
            $currentData = json_decode($currentContent, true);
            if ($currentData && json_last_error() === JSON_ERROR_NONE && character_data_has_real_data($currentData)) {
                error_log("ERROR: Rejected save - would overwrite real data with empty defaults");
                return false;
            }
        }
    }

    // Create backup of current file before saving
    if (file_exists($dataFile)) {
        $backupContent = file_get_contents($dataFile);
        if (!empty($backupContent)) {
            file_put_contents($backupFile, $backupContent, LOCK_EX);

            // Also create timestamped backup (keep last 5)
            $timestampedBackup = $dir . '/characters_backup_' . date('Ymd_His') . '.json';
            file_put_contents($timestampedBackup, $backupContent, LOCK_EX);

            // Clean up old backups (keep only last 5 timestamped ones)
            $backups = glob($dir . '/characters_backup_*.json');
            if (count($backups) > 5) {
                sort($backups);
                $toDelete = array_slice($backups, 0, count($backups) - 5);
                foreach ($toDelete as $oldBackup) {
                    if ($oldBackup !== $backupFile) { // Don't delete the _latest backup
                        unlink($oldBackup);
                    }
                }
            }

            // And the dashboard backup helper's "recent" slot (data/backups/).
            try {
                $helper = new DashboardBackupHelper($dir);
                $helper->createBackup($dataFile, 'pre-save');
            } catch (Throwable $e) {
                error_log('Dashboard backup helper failed: ' . $e->getMessage());
            }
        }
    }

    // Encode data with validation
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    if ($jsonData === false) {
        error_log("ERROR: Failed to encode character data to JSON");
        return false;
    }

    // Use atomic write: write to temp file first, then rename
    if (file_put_contents($tempFile, $jsonData, LOCK_EX) === false) {
        error_log("ERROR: Failed to write character data to temp file");
        return false;
    }

    // Verify the temp file is valid JSON
    json_decode(file_get_contents($tempFile), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("ERROR: Temp file contains invalid JSON, aborting save");
        unlink($tempFile);
        return false;
    }

    // Atomic rename (this is atomic on most filesystems)
    if (!rename($tempFile, $dataFile)) {
        error_log("ERROR: Failed to rename temp file to main file");
        unlink($tempFile);
        return false;
    }

    return true;
}

// Function to save character data
function saveCharacterData($data) {
    $lockHandle = character_data_lock();
    if (!$lockHandle) {
        return false;
    }
    try {
        return character_data_write_locked($data);
    } finally {
        character_data_unlock($lockHandle);
    }
}

/**
 * Read, change and save under one lock (no lost updates between two writers).
 * $change receives the whole data by reference and returns:
 *   - an array with 'error' => message to abort without saving;
 *   - an array with 'save' => false to save nothing;
 *   - anything else is handed back as 'result'.
 * Returns ['success' => bool, 'result' => mixed, 'error' => string].
 */
function character_data_modify(callable $change): array
{
    $lockHandle = character_data_lock();
    if (!$lockHandle) {
        return array('success' => false, 'error' => 'The character data is busy; try again.');
    }
    try {
        $data = loadCharacterData();
        if (!is_array($data)) {
            return array('success' => false, 'error' => 'Character data unavailable');
        }
        $result = $change($data);
        if (is_array($result) && isset($result['error'])) {
            return array('success' => false, 'error' => (string) $result['error']);
        }
        if (is_array($result) && array_key_exists('save', $result) && !$result['save']) {
            return array('success' => true, 'result' => $result['result'] ?? null);
        }
        if (!character_data_write_locked($data)) {
            return array('success' => false, 'error' => 'Failed to save the character data');
        }
        return array('success' => true, 'result' => $result);
    } finally {
        character_data_unlock($lockHandle);
    }
}

/**
 * A project's points become $newTotal: points_earned (string) and points_history (last 10 totals).
 * When there is no history yet, the old total goes in first so the first step shows as a step.
 */
function character_data_set_project_points(array &$project, int $newTotal): void
{
    $old = isset($project['points_earned']) ? intval($project['points_earned']) : 0;
    if (!isset($project['points_history']) || !is_array($project['points_history'])) {
        $project['points_history'] = array();
    }
    $project['points_history'] = array_values(array_map('intval', $project['points_history']));
    if (empty($project['points_history']) && $old > 0) {
        $project['points_history'][] = $old;
    }
    $project['points_earned'] = (string) $newTotal;
    $project['points_history'][] = $newTotal;
    if (count($project['points_history']) > 10) {
        $project['points_history'] = array_slice($project['points_history'], -10);
    }
}

// ---------------------------------------------------------------- the Students and Staff pages' data

function character_data_students_file(?string $set = null): string
{
    static $file = null;
    if ($set !== null) {
        $file = $set;
    }
    return $file ?? (__DIR__ . '/../strixhaven/students/students.json');
}

function character_data_staff_file(?string $set = null): string
{
    static $file = null;
    if ($set !== null) {
        $file = $set;
    }
    return $file ?? (__DIR__ . '/../strixhaven/staff/staff.json');
}

function character_data_load_students(): array
{
    $data = loadJsonFileWithBackup(character_data_students_file(), array('default' => array('students' => array()), 'backup_prefix' => 'students'));
    return (is_array($data) && isset($data['students']) && is_array($data['students'])) ? $data['students'] : array();
}

function character_data_load_staff(): array
{
    $data = loadJsonFileWithBackup(character_data_staff_file(), array('default' => array('staff' => array()), 'backup_prefix' => 'staff'));
    return (is_array($data) && isset($data['staff']) && is_array($data['staff'])) ? $data['staff'] : array();
}

/**
 * Change one student's record for a hero: relationships.{pc}_points and/or {pc}_notes (null = leave as is).
 * Found by student_id, or by name when there is no id. Same lock and backups as the Students page.
 */
function character_data_sync_student(string $studentId, string $name, string $pc, $points, $notes): bool
{
    $file = character_data_students_file();
    if (!is_file($file)) {
        return false;
    }
    $nameLower = strtolower(trim($name));
    $result = modifyJsonFileWithLock($file, function (&$data) use ($studentId, $nameLower, $pc, $points, $notes) {
        if (!isset($data['students']) || !is_array($data['students'])) {
            return array('save' => false, 'result' => false);
        }
        foreach ($data['students'] as &$student) {
            $idMatch = $studentId !== '' && isset($student['student_id']) && $student['student_id'] === $studentId;
            $nameMatch = $studentId === '' && $nameLower !== '' && isset($student['name']) && strtolower(trim($student['name'])) === $nameLower;
            if (!$idMatch && !$nameMatch) {
                continue;
            }
            if (!isset($student['relationships']) || !is_array($student['relationships'])) {
                $student['relationships'] = array();
            }
            if ($points !== null) {
                $student['relationships'][$pc . '_points'] = (string) $points;
            }
            if ($notes !== null) {
                $student['relationships'][$pc . '_notes'] = (string) $notes;
            }
            if (isset($data['metadata']) && is_array($data['metadata'])) {
                $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
            }
            return array('result' => true);
        }
        unset($student);
        return array('save' => false, 'result' => false);
    }, array(
        'default' => array('students' => array()),
        'backup_prefix' => 'students',
        'lock_file' => dirname($file) . '/students.lock',
    ));
    if (!$result['success'] && isset($result['error'])) {
        error_log('Failed to update student relationship: ' . $result['error']);
    }
    return !empty($result['success']) && !empty($result['result']);
}

// Update a student's relationship points with a PC (the dashboard's per-field save; by name)
function updateStudentRelationshipPoints($npcName, $pcName, $points) {
    character_data_sync_student('', (string) $npcName, strtolower((string) $pcName), (string) $points, null);
}
