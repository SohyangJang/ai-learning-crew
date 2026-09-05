-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. Members Table
-- ==========================================
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    balance INTEGER NOT NULL DEFAULT 100000 CHECK (balance >= 0), -- KRW balance
    fail_count INTEGER NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

-- ==========================================
-- 2. Daily Challenges Table
-- ==========================================
CREATE TABLE IF NOT EXISTS daily_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
    topic TEXT,
    submission_content TEXT,
    ai_feedback TEXT,
    score INTEGER CHECK (score >= 0 AND score <= 100),
    -- result: 'O' = Success/Pass, 'X' = Fail/Missed, 'P' = Pending
    result CHAR(1) NOT NULL DEFAULT 'P' CHECK (result IN ('O', 'X', 'P')),
    is_deducted BOOLEAN NOT NULL DEFAULT false,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_member_challenge_date UNIQUE (member_id, challenge_date)
);

-- Indexes for querying challenges
CREATE INDEX IF NOT EXISTS idx_daily_challenges_member ON daily_challenges(member_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON daily_challenges(challenge_date);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_result ON daily_challenges(result);

-- ==========================================
-- 3. Penalty Deduction Trigger Function (2,000 KRW & fail_count increment)
-- ==========================================
CREATE OR REPLACE FUNCTION handle_challenge_penalty()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger when challenge result is marked as 'X' and penalty has not been deducted yet
    IF NEW.result = 'X' AND NEW.is_deducted IS FALSE THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.result IS DISTINCT FROM 'X' OR OLD.is_deducted IS FALSE)) THEN
            -- Deduct 2,000 KRW from balance and increment fail_count
            UPDATE members
            SET balance = GREATEST(0, balance - 2000),
                fail_count = fail_count + 1,
                updated_at = now()
            WHERE id = NEW.member_id;

            -- Mark penalty as deducted to avoid duplicate charges
            NEW.is_deducted := true;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists to allow safe re-running
DROP TRIGGER IF EXISTS trg_handle_challenge_penalty ON daily_challenges;

CREATE TRIGGER trg_handle_challenge_penalty
BEFORE INSERT OR UPDATE ON daily_challenges
FOR EACH ROW
EXECUTE FUNCTION handle_challenge_penalty();

-- ==========================================
-- 4. Timestamp Auto-Update Trigger
-- ==========================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at
BEFORE UPDATE ON members
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_daily_challenges_updated_at ON daily_challenges;
CREATE TRIGGER trg_daily_challenges_updated_at
BEFORE UPDATE ON daily_challenges
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
