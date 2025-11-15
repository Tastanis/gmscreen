-- Bingo persistence tables for ASL Hub 2

CREATE TABLE IF NOT EXISTS bingo_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    asl_level TINYINT NOT NULL DEFAULT 2,
    selected_word_source LONGTEXT NOT NULL,
    word_pool LONGTEXT NOT NULL,
    status ENUM('ready','active','won','closed') NOT NULL DEFAULT 'ready',
    last_drawn_word VARCHAR(255) DEFAULT NULL,
    last_drawn_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at DATETIME DEFAULT NULL,
    CONSTRAINT fk_bingo_sessions_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_bingo_sessions_teacher (teacher_id, asl_level, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bingo_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    card_words LONGTEXT NOT NULL,
    marks LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_bingo_card (session_id, user_id),
    CONSTRAINT fk_bingo_cards_session FOREIGN KEY (session_id) REFERENCES bingo_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_bingo_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bingo_draws (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    word VARCHAR(255) NOT NULL,
    draw_order INT NOT NULL,
    drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_bingo_draw (session_id, draw_order),
    CONSTRAINT fk_bingo_draws_session FOREIGN KEY (session_id) REFERENCES bingo_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bingo_claims (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    card_snapshot LONGTEXT NOT NULL,
    marks_snapshot LONGTEXT NOT NULL,
    evaluation_payload LONGTEXT NOT NULL,
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    resolution_payload LONGTEXT DEFAULT NULL,
    resolved_at DATETIME DEFAULT NULL,
    student_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bingo_claims_session FOREIGN KEY (session_id) REFERENCES bingo_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_bingo_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_bingo_claims_status (session_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
