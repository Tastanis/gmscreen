-- Add scroller_enabled column to scroller_wordlists table
ALTER TABLE scroller_wordlists 
ADD COLUMN scroller_enabled BOOLEAN DEFAULT 1 AFTER word_count;

-- Set all existing word lists to enabled by default
UPDATE scroller_wordlists SET scroller_enabled = 1;