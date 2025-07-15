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
INSERT INTO skills (skill_name, skill_description, order_index) VALUES
('Skill Test 1', 'This is the first skill test for ASL students', 1),
('Skill Test 2', 'This is the second skill test for ASL students', 2);

-- Insert sample resources
INSERT INTO resources (skill_id, resource_name, resource_url, order_index) VALUES
(1, 'Resource 1 for Skill Test 1', '#', 1),
(1, 'Resource 2 for Skill Test 1', '#', 2),
(1, 'Resource 3 for Skill Test 1', '#', 3),
(2, 'Resource 1 for Skill Test 2', '#', 1),
(2, 'Resource 2 for Skill Test 2', '#', 2);

