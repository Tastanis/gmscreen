-- ASL Hub Database Update for Levels Support
-- Run this SQL to add level support to the existing database

-- Add level column to users table (1 for ASL 1, 2 for ASL 2)
ALTER TABLE users ADD COLUMN level INT DEFAULT 1;

-- Update existing users to be ASL 1 by default (if you have existing users)
UPDATE users SET level = 1 WHERE level IS NULL;

-- Optional: Create index for faster level-based queries
CREATE INDEX idx_users_level ON users(level);

-- Note: Teachers can access both levels, so their level field can be NULL or a specific value
-- The application logic will handle teacher access to both levels