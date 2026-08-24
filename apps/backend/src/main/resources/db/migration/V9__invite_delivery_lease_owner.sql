-- Invite delivery: an explicit DELIVERING state, and a lease owner.
--
-- The worker used to do everything — claim, mint, send, record — inside one
-- transaction. A `RuntimeException` from any part of that rolled the whole
-- thing back, including the claim: the row went right back to being the
-- oldest due job, so the next pass picked up the same poisoned invitation
-- first, and every healthy invitation behind it in the batch never got a
-- turn. Worse, the redemption predicate never checked `delivery_status`, only
-- `active`/`consumed_at`/`expires_at` — so a token hash committed a moment
-- before an SMTP call that then failed was briefly a live, redeemable
-- credential for mail nobody received.
--
-- `DELIVERING` closes both problems by giving the worker somewhere to put a
-- claimed-and-hashed-but-not-yet-sent attempt that is neither "still queued"
-- nor "actually delivered": the claim, the hash and the send become three
-- separate transactions, none of which can roll back another, and nothing is
-- redeemable until the row reaches `SENT`.
--
-- `lease_owner` is what stops a worker that has lost its lease — outlived by a
-- slow SMTP call, or simply crashed — from writing `SENT` after somebody else
-- has already reclaimed the same job. Every transition out of `DELIVERING`
-- checks it in the same statement that reads it, the way `token_hash` and
-- `invited_email` are already checked together in `claim`.
ALTER TABLE invite_tokens
    ADD COLUMN lease_owner uuid;

ALTER TABLE invite_tokens DROP CONSTRAINT invite_tokens_delivery_status_check;
ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_delivery_status_check CHECK (
        (delivery_status)::text = ANY (ARRAY['QUEUED', 'DELIVERING', 'SENT', 'FAILED']::text[])
    );

-- The worker's claim query now also has to find jobs stuck in `DELIVERING`
-- whose lease has expired — a worker that died mid-attempt — not only jobs
-- still `QUEUED`. Same column, same partial-index shape as before; the
-- predicate just admits one more status.
DROP INDEX IF EXISTS idx_invite_tokens_due;
CREATE INDEX idx_invite_tokens_due
    ON invite_tokens USING btree (next_attempt_at)
 WHERE delivery_status IN ('QUEUED', 'DELIVERING');

-- The redemption predicate, restated to match: a hash that exists only means
-- an attempt is in flight or was, never that the mail actually left. Only
-- `SENT` is redeemable now, which is also enforced in Java by
-- `InviteToken#isRedeemable()` and in the claim query in
-- `InviteTokenRepository#claim` — this index exists to make that predicate
-- fast, not to be the only place it is written.
DROP INDEX IF EXISTS idx_invite_tokens_redeemable;
CREATE INDEX idx_invite_tokens_redeemable
    ON invite_tokens USING btree (token_hash)
 WHERE active AND consumed_at IS NULL AND delivery_status = 'SENT';
