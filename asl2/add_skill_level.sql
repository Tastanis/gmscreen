-- One-off migration to add ASL level support to skills
ALTER TABLE skills
    ADD COLUMN IF NOT EXISTS asl_level TINYINT NOT NULL DEFAULT 3 AFTER unit;

UPDATE skills
SET asl_level = 3
WHERE asl_level IS NULL OR asl_level NOT IN (1, 2, 3);
