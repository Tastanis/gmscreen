<?php
/** Self-contained schema and data helpers for the unified ASL Scroller. */

function aslhub_scroller_ensure_schema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS asl_scroller_wordlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        teacher_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        words LONGTEXT NOT NULL,
        speed_setting DECIMAL(3,1) NOT NULL DEFAULT 1.0,
        word_count SMALLINT UNSIGNED NOT NULL DEFAULT 10,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        active TINYINT(1) NOT NULL DEFAULT 1,
        legacy_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_scroller_legacy (legacy_id),
        INDEX idx_scroller_teacher_active (teacher_id, active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS asl_scroller_wordlist_levels (
        wordlist_id INT NOT NULL,
        asl_level TINYINT UNSIGNED NOT NULL,
        PRIMARY KEY (wordlist_id, asl_level),
        INDEX idx_scroller_level (asl_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    aslhub_scroller_import_legacy($pdo);
}

function aslhub_scroller_strlen(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function aslhub_scroller_lower(string $value): string {
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function aslhub_scroller_substr(string $value, int $length): string {
    return function_exists('mb_substr') ? mb_substr($value, 0, $length, 'UTF-8') : substr($value, 0, $length);
}

/** Import each old bank once. Legacy level 3 meant 'ASL 1 and 2', not ASL 3. */
function aslhub_scroller_import_legacy(PDO $pdo): void {
    try {
        $exists = $pdo->query("SHOW TABLES LIKE 'scroller_wordlists'")->fetchColumn();
        if (!$exists) return;
        $columns = [];
        foreach ($pdo->query("SHOW COLUMNS FROM scroller_wordlists") as $row) $columns[$row['Field']] = true;
        foreach (['id', 'teacher_id', 'name', 'words'] as $required) if (empty($columns[$required])) return;

        $speed = isset($columns['speed_setting']) ? 'speed_setting' : '1.0 AS speed_setting';
        $count = isset($columns['word_count']) ? 'word_count' : '10 AS word_count';
        $enabled = isset($columns['scroller_enabled']) ? 'scroller_enabled' : '1 AS scroller_enabled';
        $level = isset($columns['asl_level']) ? 'asl_level' : '1 AS asl_level';
        $rows = $pdo->query("SELECT id, teacher_id, name, words, $speed, $count, $enabled, $level FROM scroller_wordlists")->fetchAll();
        $insert = $pdo->prepare("INSERT IGNORE INTO asl_scroller_wordlists
            (teacher_id, name, words, speed_setting, word_count, enabled, active, legacy_id)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)");
        $find = $pdo->prepare("SELECT id FROM asl_scroller_wordlists WHERE legacy_id = ?");
        $addLevel = $pdo->prepare("INSERT IGNORE INTO asl_scroller_wordlist_levels (wordlist_id, asl_level) VALUES (?, ?)");
        foreach ($rows as $row) {
            $words = json_decode((string)$row['words'], true);
            if (!is_array($words)) continue;
            $insert->execute([(int)$row['teacher_id'], aslhub_scroller_substr((string)$row['name'], 120),
                json_encode(array_values($words), JSON_UNESCAPED_UNICODE),
                max(.5, min(2.0, (float)$row['speed_setting'])),
                max(5, min(50, (int)$row['word_count'])), (int)!empty($row['scroller_enabled']), (int)$row['id']]);
            $find->execute([(int)$row['id']]);
            $newId = (int)$find->fetchColumn();
            if (!$newId) continue;
            $oldLevel = (int)$row['asl_level'];
            $levels = $oldLevel === 3 ? [1, 2] : (in_array($oldLevel, [1, 2], true) ? [$oldLevel] : [1]);
            foreach ($levels as $value) $addLevel->execute([$newId, $value]);
        }
    } catch (PDOException $e) {
        error_log('ASL scroller legacy import skipped: ' . $e->getMessage());
    }
}

function aslhub_scroller_parse_words(string $raw): array {
    $parts = preg_split('/[\r\n,]+/u', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $words = [];
    $seen = [];
    foreach ($parts as $part) {
        $word = trim(preg_replace('/\s+/u', ' ', $part) ?? $part);
        if ($word === '' || aslhub_scroller_strlen($word) > 100) continue;
        $key = aslhub_scroller_lower($word);
        if (!isset($seen[$key])) { $seen[$key] = true; $words[] = $word; }
    }
    return $words;
}

function aslhub_scroller_levels(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT asl_level FROM asl_scroller_wordlist_levels WHERE wordlist_id = ? ORDER BY asl_level');
    $stmt->execute([$id]);
    return array_map('intval', array_column($stmt->fetchAll(), 'asl_level'));
}
