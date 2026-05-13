-- Add reply preference columns to feedback table
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS wants_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_email text DEFAULT NULL;
