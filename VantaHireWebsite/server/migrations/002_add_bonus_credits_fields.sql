-- Migration: Add bonus credits fields to organization_subscriptions
-- These fields support admin-granted bonus credits and custom credit limits

-- Add bonus credits pool field (org-level shared pool)
ALTER TABLE organization_subscriptions
ADD COLUMN IF NOT EXISTS bonus_credits INTEGER DEFAULT 0;

-- Add bonus credits metadata
ALTER TABLE organization_subscriptions
ADD COLUMN IF NOT EXISTS bonus_credits_granted_at TIMESTAMP;

ALTER TABLE organization_subscriptions
ADD COLUMN IF NOT EXISTS bonus_credits_reason TEXT;

ALTER TABLE organization_subscriptions
ADD COLUMN IF NOT EXISTS bonus_credits_granted_by INTEGER REFERENCES users(id);

-- Add custom credit limit override (for Business plan customization)
ALTER TABLE organization_subscriptions
ADD COLUMN IF NOT EXISTS custom_credit_limit INTEGER;

-- Verify the migration
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_subscriptions'
AND column_name IN ('bonus_credits', 'bonus_credits_granted_at', 'bonus_credits_reason', 'bonus_credits_granted_by', 'custom_credit_limit');
