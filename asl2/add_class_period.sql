-- Add class_period column to users table for ASL2
-- This allows students to select their class period (1-6)

ALTER TABLE users 
ADD COLUMN class_period INT NULL 
COMMENT 'Student class period (1-6)';

-- Add index for faster filtering by class period
ALTER TABLE users 
ADD INDEX idx_class_period (class_period);

-- Update existing students to have NULL class_period (unselected)
-- This is already the default, but making it explicit
UPDATE users 
SET class_period = NULL 
WHERE class_period IS NULL AND is_teacher = FALSE;