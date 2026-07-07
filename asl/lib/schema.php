<?php
/**
 * ASL Hub schema installer — STRICTLY ADDITIVE.
 *
 * Rules (do not break these):
 *  - Only CREATE TABLE IF NOT EXISTS and ADD COLUMN when missing.
 *  - NEVER drop tables/columns, NEVER DELETE rows. Retiring content is done
 *    by setting active = 0, so student scores can never be orphaned or lost.
 *  - Bump ASLHUB_SCHEMA_VERSION when adding anything new; the check is skipped
 *    on normal page loads once the stored version matches.
 */

const ASLHUB_SCHEMA_VERSION = 4;

function aslhub_ensure_schema(PDO $pdo, bool $force = false): void {
    static $done = false;
    if ($done && !$force) return;
    $done = true;

    try {
        $current = null;
        try {
            $stmt = $pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key = 'schema_version'");
            $row = $stmt->fetch();
            $current = $row ? (int)$row['setting_value'] : null;
        } catch (PDOException $e) {
            $current = null; // settings table missing -> full install
        }
        if (!$force && $current === ASLHUB_SCHEMA_VERSION) return;

        // ----- settings + login throttle -----
        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value TEXT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            attempt_key VARCHAR(255) NOT NULL,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_login_attempts (attempt_key, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // ----- users: base table (fresh installs) + additive columns -----
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        aslhub_add_column($pdo, 'users', 'email', "VARCHAR(255) NULL");
        aslhub_add_column($pdo, 'users', 'is_teacher', "BOOLEAN NOT NULL DEFAULT FALSE");
        aslhub_add_column($pdo, 'users', 'level', "TINYINT NULL COMMENT 'ASL level 1-3'");
        aslhub_add_column($pdo, 'users', 'class_period', "INT NULL COMMENT 'Class period 1-6'");
        aslhub_add_column($pdo, 'users', 'teacher', "VARCHAR(20) NULL COMMENT 'harms or parks'");
        aslhub_add_column($pdo, 'users', 'is_active', "TINYINT(1) NOT NULL DEFAULT 1");
        aslhub_add_column($pdo, 'users', 'must_change_password', "TINYINT(1) NOT NULL DEFAULT 0");
        aslhub_add_column($pdo, 'users', 'password_reset_token', "VARCHAR(255) NULL");
        aslhub_add_column($pdo, 'users', 'password_reset_expires', "DATETIME NULL");

        // ----- proficiency taxonomy -----
        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_skill_buckets (
            bucket_id VARCHAR(12) NOT NULL PRIMARY KEY,
            code VARCHAR(12) NOT NULL,
            name VARCHAR(255) NOT NULL,
            blurb TEXT NULL,
            order_index INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        aslhub_add_column($pdo, 'asl_skill_buckets', 'active', "TINYINT(1) NOT NULL DEFAULT 1");

        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_standards (
            standard_id VARCHAR(20) NOT NULL PRIMARY KEY,
            bucket_id VARCHAR(12) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            order_index INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_asl_standards_bucket (bucket_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        aslhub_add_column($pdo, 'asl_standards', 'active', "TINYINT(1) NOT NULL DEFAULT 1");

        // Gradable unit: one row per skill thread per ASL level (e.g. CLS.1.1a)
        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_learning_targets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            standard_id VARCHAR(20) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            order_index INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            asl_level TINYINT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_asl_lts_standard (standard_id),
            INDEX idx_asl_lts_level (asl_level)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        aslhub_add_column($pdo, 'asl_learning_targets', 'target_code', "VARCHAR(20) NULL COMMENT 'e.g. CLS.1.1a'");
        aslhub_add_column($pdo, 'asl_learning_targets', 'sub_code', "VARCHAR(4) NULL COMMENT 'thread letter, e.g. a'");
        aslhub_add_index($pdo, 'asl_learning_targets', 'uniq_target_code', "UNIQUE (target_code)");

        // Rubric text: one row per target per score 0-4
        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_rubric_levels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            learning_target_id INT NOT NULL,
            score TINYINT NOT NULL,
            descriptor TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_target_score (learning_target_id, score),
            INDEX idx_rubric_target (learning_target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_learning_target_resources (
            id INT AUTO_INCREMENT PRIMARY KEY,
            learning_target_id INT NULL,
            resource_type VARCHAR(40) NOT NULL DEFAULT 'link',
            resource_label VARCHAR(255) NOT NULL,
            resource_url VARCHAR(500) NULL,
            resource_description TEXT NULL,
            order_index INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_asl_lt_resources_target (learning_target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        // Resources may also attach to a standard (shared across the levels)
        aslhub_add_column($pdo, 'asl_learning_target_resources', 'standard_id', "VARCHAR(20) NULL");
        aslhub_add_column($pdo, 'asl_learning_target_resources', 'asl_level', "TINYINT NULL");
        // v4: standard-attached resources have no target, so the column must allow NULL
        try {
            $pdo->exec("ALTER TABLE asl_learning_target_resources MODIFY learning_target_id INT NULL");
        } catch (PDOException $e) {
            error_log('ASL Hub: could not relax learning_target_id nullability: ' . $e->getMessage());
        }

        // ----- student data -----
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_learning_targets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            learning_target_id INT NOT NULL,
            score TINYINT NULL,
            completed_at DATETIME NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_learning_target (user_id, learning_target_id),
            INDEX idx_user_lt_user (user_id),
            INDEX idx_user_lt_target (learning_target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Append-only. Current scores can always be rebuilt from this table.
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_learning_target_score_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            learning_target_id INT NOT NULL,
            score TINYINT NOT NULL DEFAULT 0,
            scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_lt_history_user_time (user_id, scored_at),
            INDEX idx_user_lt_history_target (learning_target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        aslhub_add_column($pdo, 'user_learning_target_score_history', 'scored_by', "INT NULL COMMENT 'teacher user id'");

        // Weekly log: one row per student per week (meeting_date = Monday of week)
        $pdo->exec("CREATE TABLE IF NOT EXISTS asl_student_meetings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            meeting_date DATE NOT NULL,
            absences INT NOT NULL DEFAULT 0,
            participation_pct DECIMAL(5,2) NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_asl_meetings_user_date (user_id, meeting_date),
            INDEX idx_asl_meetings_date (meeting_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        aslhub_add_column($pdo, 'asl_student_meetings', 'participation_points', "INT NULL COMMENT 'weekly participation points (SCM)'");
        aslhub_add_index($pdo, 'asl_student_meetings', 'uniq_user_week', "UNIQUE (user_id, meeting_date)");

        aslhub_set_setting($pdo, 'schema_version', (string)ASLHUB_SCHEMA_VERSION);
    } catch (PDOException $e) {
        error_log('ASL Hub schema check failed: ' . $e->getMessage());
    }
}

function aslhub_add_column(PDO $pdo, string $table, string $column, string $definition): void {
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    }
}

function aslhub_add_index(PDO $pdo, string $table, string $name, string $definition): void {
    $stmt = $pdo->prepare("SHOW INDEX FROM `$table` WHERE Key_name = ?");
    $stmt->execute([$name]);
    if ($stmt->rowCount() === 0) {
        try {
            $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$name` $definition");
        } catch (PDOException $e) {
            // Duplicate data can block a unique index on legacy rows; log, never crash.
            error_log("ASL Hub: could not add index $name on $table: " . $e->getMessage());
        }
    }
}
