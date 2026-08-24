-- Organization-admin self-registration, moved behind email-ownership
-- verification.
--
-- Registration used to create the organization and the admin account inside
-- the request that asked for them, and answer differently depending on
-- whether the address was already taken — an unauthenticated way to learn
-- whether somebody has an account. This table is what the request creates
-- instead: an intention, identical in shape whether or not the address turns
-- out to be registrable. The organization and the admin account are created
-- only when a row's token is redeemed.
--
-- Delivery is a worker's job, shaped exactly like invite_tokens/InviteToken
-- and for the same reasons — see V9's own note on delivery_status and
-- lease_owner, which apply here unchanged. The one addition, SUPPRESSED, has
-- no counterpart there: the worker found, at send time, that the address was
-- already registered, and resolved the row without mailing anything.
--
-- password_hash is a bcrypt hash, computed once at request time from the
-- same call this application would make anyway to store a new account's
-- password — never plaintext, and its presence here is exactly what lets an
-- address that turns out to be taken cost the same hashing round-trip as one
-- that does not, which is what keeps the request handler's timing identical
-- between the two.
CREATE TABLE registration_verifications (
    id                    uuid PRIMARY KEY,
    email                 character varying(180) NOT NULL,
    admin_name            character varying(120) NOT NULL,
    organization_name     character varying(160) NOT NULL,
    headquarter_address   text NOT NULL,
    password_hash         character varying(255) NOT NULL,
    token_hash            character varying(64),
    expires_at            timestamp(6) with time zone NOT NULL,
    used_at               timestamp(6) with time zone,
    delivery_status       character varying(20) NOT NULL DEFAULT 'QUEUED',
    attempt_count         integer NOT NULL DEFAULT 0,
    next_attempt_at       timestamp(6) with time zone,
    lease_owner           uuid,
    last_error            character varying(500),
    created_at            timestamp(6) with time zone NOT NULL,
    updated_at            timestamp(6) with time zone NOT NULL,
    CONSTRAINT registration_verifications_delivery_status_check CHECK (
        (delivery_status)::text = ANY (ARRAY[
            'QUEUED', 'DELIVERING', 'SENT', 'FAILED', 'SUPPRESSED'
        ]::text[])
    )
);

-- Unique only where present, exactly like invite_tokens.token_hash: a queued
-- row has no token yet, so uniqueness only needs to hold among rows a worker
-- has actually minted one for.
CREATE UNIQUE INDEX idx_registration_verifications_token_hash_unique
    ON registration_verifications USING btree (token_hash)
 WHERE token_hash IS NOT NULL;

-- The worker's claim query: rows still QUEUED and due, or DELIVERING with an
-- expired lease. Same shape as idx_invite_tokens_due.
CREATE INDEX idx_registration_verifications_due
    ON registration_verifications USING btree (next_attempt_at)
 WHERE delivery_status IN ('QUEUED', 'DELIVERING');

-- The redemption predicate: only a SENT row's hash is a live credential —
-- enforced in Java by RegistrationVerificationRepository#claim, this index
-- exists to make that predicate fast, not to be the only place it is written.
CREATE INDEX idx_registration_verifications_redeemable
    ON registration_verifications USING btree (token_hash)
 WHERE used_at IS NULL AND delivery_status = 'SENT';

-- Cleanup support: expired or terminal rows are the ones a retention job
-- would ever delete, ordered by how long ago they were created.
CREATE INDEX idx_registration_verifications_created_at
    ON registration_verifications USING btree (created_at);
