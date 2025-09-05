-- Add asl_level column to scroller_wordlists table for ASL1
-- This allows teachers to specify if a word list is for ASL 1, ASL 2, or both

ALTER TABLE scroller_wordlists 
ADD COLUMN asl_level INT DEFAULT 1 
COMMENT 'ASL level: 1=ASL1 only, 2=ASL2 only, 3=Both levels';

-- Add index for faster filtering by ASL level
ALTER TABLE scroller_wordlists 
ADD INDEX idx_asl_level (asl_level);

-- Update existing word lists to default to current level (ASL 1)
UPDATE scroller_wordlists 
SET asl_level = 1 
WHERE asl_level IS NULL;