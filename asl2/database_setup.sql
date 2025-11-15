-- ASL Hub Database Schema Updates

-- Update users table to add email and teacher role
ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN is_teacher BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN password_reset_expires DATETIME NULL;

-- Insert teacher account (password is 'Dark-dude3')
INSERT INTO users (first_name, last_name, password, email, is_teacher) 
VALUES ('Brandon', 'Harms', '$2y$10$YourHashedPasswordHere', 'brandon.harms@mghs.edu', TRUE)
ON DUPLICATE KEY UPDATE 
    password = '$2y$10$YourHashedPasswordHere',
    is_teacher = TRUE,
    email = 'brandon.harms@mghs.edu';

-- Note: The password hash above is a placeholder. 
-- In the login.php, we handle teacher authentication separately with the plain text password 'Dark-dude3'
-- This is only for the initial setup. In production, you should use proper password hashing.

-- Create skills table
CREATE TABLE IF NOT EXISTS skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_name VARCHAR(255) NOT NULL,
    skill_description TEXT,
    unit VARCHAR(255) NULL,
    asl_level TINYINT NOT NULL DEFAULT 3,
    points_not_started INT DEFAULT 0,
    points_progressing INT DEFAULT 1,
    points_proficient INT DEFAULT 3,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create user_skills table to track individual progress
CREATE TABLE IF NOT EXISTS user_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    skill_id INT NOT NULL,
    status ENUM('not_started', 'progressing', 'proficient') DEFAULT 'not_started',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_skill (user_id, skill_id)
);

-- Create resources table
CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT NOT NULL,
    resource_name VARCHAR(255) NOT NULL,
    resource_url VARCHAR(500),
    resource_description TEXT,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Insert sample skills
INSERT INTO skills (skill_name, skill_description, order_index, asl_level) VALUES
('Skill Test 1', 'This is the first skill test for ASL students', 1, 3),
('Skill Test 2', 'This is the second skill test for ASL students', 2, 3);

-- Insert sample resources
INSERT INTO resources (skill_id, resource_name, resource_url, order_index) VALUES
(1, 'Resource 1 for Skill Test 1', '#', 1),
(1, 'Resource 2 for Skill Test 1', '#', 2),
(1, 'Resource 3 for Skill Test 1', '#', 3),
(2, 'Resource 1 for Skill Test 2', '#', 1),
(2, 'Resource 2 for Skill Test 2', '#', 2);

-- Add unit column to existing skills table (for existing databases)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS unit VARCHAR(255) NULL AFTER skill_description;

-- Word lists for scroller game
CREATE TABLE IF NOT EXISTS wordlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    wordlist_name VARCHAR(255) NOT NULL,
    words TEXT NOT NULL,
    speed FLOAT DEFAULT 1.0,
    word_count INT DEFAULT 24,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Active scroller sessions
CREATE TABLE IF NOT EXISTS scroller_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    wordlist_ids TEXT NOT NULL,
    speed_override FLOAT NULL,
    word_count_override INT NULL,
    seed INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);


-- Bingo session tables
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
