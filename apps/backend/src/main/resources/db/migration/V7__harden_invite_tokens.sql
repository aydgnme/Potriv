-- Invite tokens: bound to one recipient, hashed at rest, expiring, single use.
--
-- The table stored the invite's raw value in `token`, with `expires_at`
-- nullable and nothing recording that an invite had been used. Every row in
-- production therefore carried a permanently valid, unlimited-use credential
-- in plaintext, and anyone who could read the table could mint registrations
-- into any organization.
--
-- The two other token tables in this schema already do the right thing
-- (`refresh_tokens.token_hash`, `password_reset_tokens.token_hash`); this
-- brings invites onto the same footing.
--
-- Invites are now addressed to a person. `invited_email` is the address the
-- invite was issued for, and redemption requires the registering address to
-- match it — so a link that reaches the wrong inbox is useless there, and one
-- invite creates exactly one account.
--
-- Every existing invite is revoked rather than migrated. Their raw values have
-- been readable in the database, in registration responses and in any URL log
-- that recorded them, so they are treated as disclosed. An organization admin
-- invites each person again, by address.

ALTER TABLE invite_tokens
    ADD COLUMN token_hash      character varying(64),
    ADD COLUMN invited_email   character varying(180),
    ADD COLUMN consumed_at     timestamp(6) with time zone,
    ADD COLUMN revoked_at      timestamp(6) with time zone,
    -- Delivery state. The invitation row *is* the outbox record: creating it
    -- and sending the mail are separate transactions, so a mail server that is
    -- down cannot roll back the intent and an intent that is committed cannot
    -- be silently lost.
    ADD COLUMN delivery_status character varying(20),
    ADD COLUMN attempt_count   integer,
    ADD COLUMN next_attempt_at timestamp(6) with time zone,
    -- The last failure, for an operator. Never the token, and never the link.
    ADD COLUMN last_error      character varying(500);

-- Revoke everything that exists. `active = false` is what the application
-- already reads; `revoked_at` records when and gives the reason a place to
-- live. No raw value is copied into the new column: these rows are not being
-- carried over, they are being retired.
UPDATE invite_tokens
   SET active     = false,
       revoked_at = now(),
       expires_at = COALESCE(expires_at, now());

-- Retired rows need a value to satisfy NOT NULL, and it must be one that no
-- token can ever hash to. Redemption looks a row up by
-- `TokenDigest.sha256Base64Url(rawToken)`, which is always 43 characters of
-- base64url; `retired-` followed by the row's own id is 40 characters and
-- contains a character that alphabet does not. So these rows are unreachable by
-- *format* — not by a flag, and not by a random value that happens not to
-- collide. It also keeps the migration free of pgcrypto: `gen_random_bytes`
-- lives in an extension that is not installed here, and requiring one would
-- make this migration fail on a stock database.
UPDATE invite_tokens
   SET token_hash    = 'retired-' || replace(id::text, '-', ''),
       invited_email = 'retired-' || id || '@invalid'
 WHERE token_hash IS NULL;

-- Retired rows are past any delivery question.
UPDATE invite_tokens
   SET delivery_status = 'FAILED',
       attempt_count   = 0
 WHERE delivery_status IS NULL;

-- `token_hash` is deliberately nullable.
--
-- A queued invitation has no token yet: the worker mints one when it claims the
-- job, so that a token exists only from the moment it is about to be mailed and
-- a failed attempt leaves nothing redeemable behind. Uniqueness is enforced by
-- a partial index below, which applies exactly where a value is present.
ALTER TABLE invite_tokens
    ALTER COLUMN invited_email   SET NOT NULL,
    ALTER COLUMN expires_at      SET NOT NULL,
    ALTER COLUMN delivery_status SET NOT NULL,
    ALTER COLUMN attempt_count   SET NOT NULL;

ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_delivery_status_check CHECK (
        (delivery_status)::text = ANY (ARRAY['QUEUED', 'SENT', 'FAILED']::text[])
    );

-- The raw column and everything that indexed it.
DROP INDEX IF EXISTS idx_invite_tokens_token;
ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_token_key;
ALTER TABLE invite_tokens DROP COLUMN token;

-- Unique where present. A plain UNIQUE would also allow many NULLs, but a
-- partial index says what is meant: rows without a token are not competing for
-- uniqueness because they are not addressable yet.
CREATE UNIQUE INDEX invite_tokens_token_hash_key
    ON invite_tokens USING btree (token_hash)
 WHERE token_hash IS NOT NULL;

CREATE INDEX idx_invite_tokens_invited_email
    ON invite_tokens USING btree (invited_email);

-- The redemption predicate, as an index: the accept path looks up by hash and
-- tests the rest in the same statement.
CREATE INDEX idx_invite_tokens_redeemable
    ON invite_tokens USING btree (token_hash)
 WHERE active AND consumed_at IS NULL;

-- The worker's claim query: the oldest job whose backoff has elapsed. Partial,
-- so the index stays the size of the backlog rather than the table.
CREATE INDEX idx_invite_tokens_due
    ON invite_tokens USING btree (next_attempt_at)
 WHERE delivery_status = 'QUEUED';
