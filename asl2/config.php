<?php
// Database configuration
$servername = "localhost";
$username = "asl_admin";                    // Your database user
$password = "2150881stave.nw";       // Replace with the password you created for asl_admin
$dbname = "asl_users";                     // Your database name

try {
    $pdo = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

if (!function_exists('aslhubEnsureSkillLevels')) {
    function aslhubEnsureSkillLevels(PDO $pdo, int $defaultWordlistLevel = 1): void
    {
        static $checked = false;

        if ($checked) {
            return;
        }

        $checked = true;

        try {
            $columnCheck = $pdo->query("SHOW COLUMNS FROM skills LIKE 'asl_level'");
            if ($columnCheck && $columnCheck->rowCount() === 0) {
                $pdo->exec("ALTER TABLE skills ADD COLUMN asl_level TINYINT NOT NULL DEFAULT 3 AFTER unit");
            }

            $pdo->exec("UPDATE skills SET asl_level = 3 WHERE asl_level IS NULL OR asl_level NOT IN (1, 2, 3)");
        } catch (PDOException $e) {
            error_log('ASL Hub schema check (skills.asl_level) failed: ' . $e->getMessage());
        }

        try {
            $columnCheck = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'asl_level'");
            if ($columnCheck && $columnCheck->rowCount() === 0) {
                $pdo->exec("ALTER TABLE scroller_wordlists ADD COLUMN asl_level TINYINT NOT NULL DEFAULT " . (int) $defaultWordlistLevel . " AFTER word_count");
            }

            $stmt = $pdo->prepare("UPDATE scroller_wordlists SET asl_level = :default WHERE asl_level IS NULL OR asl_level NOT IN (1, 2, 3)");
            $stmt->execute([':default' => in_array($defaultWordlistLevel, [1, 2, 3], true) ? $defaultWordlistLevel : 1]);
        } catch (PDOException $e) {
            error_log('ASL Hub schema check (scroller_wordlists.asl_level) failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('aslhubEnsureGoalsTable')) {
    function aslhubEnsureGoalsTable(PDO $pdo): void
    {
        static $checkedGoals = false;

        if ($checkedGoals) {
            return;
        }

        $checkedGoals = true;

        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS user_goals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                framework VARCHAR(100) NOT NULL,
                goal_type ENUM('daily','weekly') NOT NULL DEFAULT 'daily',
                goal_focus TEXT NOT NULL,
                success_criteria TEXT NOT NULL,
                status ENUM('not_started','progressing','proficient') NOT NULL DEFAULT 'not_started',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_goals_user (user_id),
                CONSTRAINT fk_user_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (PDOException $e) {
            error_log('ASL Hub schema check (user_goals) failed: ' . $e->getMessage());
        }
    }
}

aslhubEnsureSkillLevels($pdo, 2);
aslhubEnsureGoalsTable($pdo);
?>
