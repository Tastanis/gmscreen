<?php
function aslhub_goals_schema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_goals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        framework VARCHAR(100) NOT NULL DEFAULT 'simple',
        goal_type VARCHAR(20) NOT NULL DEFAULT 'daily',
        goal_focus TEXT NOT NULL,
        success_criteria TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'not_started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_goal_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
