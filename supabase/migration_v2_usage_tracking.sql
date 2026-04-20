-- Migration v2: Add premium tier and usage tracking
-- Run this in the Supabase SQL editor on existing installs.
-- The main schema.sql has already been updated to include these changes.

-- 1. Drop the old user_type CHECK constraint and add premium
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('guest', 'member', 'premium', 'admin'));

-- 2. Add usage tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_daily_count        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_daily_reset_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ai_monthly_count      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_monthly_reset_month SMALLINT   NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_monthly_reset_year  SMALLINT   NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT;
