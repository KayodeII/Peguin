-- Billing moves from Stripe to Paystack. Paystack plans have no trials, so the
-- 14-day trial is ours: it starts when the account is created, no card needed.
ALTER TABLE users ADD COLUMN paystack_customer_code TEXT;
ALTER TABLE users ADD COLUMN trial_ends_at INTEGER;
UPDATE users SET trial_ends_at = created_at + 14 * 86400 WHERE trial_ends_at IS NULL;

ALTER TABLE subscriptions ADD COLUMN paystack_subscription_code TEXT;
CREATE UNIQUE INDEX subscriptions_paystack ON subscriptions(paystack_subscription_code);

-- Paystack events carry no id; each is keyed by a hash of its body and applied once.
CREATE TABLE paystack_events (
  id           TEXT PRIMARY KEY,
  received_at  INTEGER NOT NULL
);
