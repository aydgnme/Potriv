-- A shared, atomic rate-limit store.
--
-- This backend runs as more than one instance behind a load balancer (Azure),
-- so a limiter that counts in one process's memory counts nothing: each
-- instance would enforce its own quota independently, and the effective limit
-- becomes (configured limit) x (instance count). Every write here goes through
-- a single-statement conditional UPDATE or INSERT ... ON CONFLICT, so the
-- database — not any one process — is what decides whether a request is
-- within quota, and every instance sees the same answer.
--
-- This is PostgreSQL, not Redis. The security review that asked for this
-- explicitly allows a database-backed limiter as an interim measure, on the
-- condition that using one instead of a dedicated in-memory store is reported
-- rather than left implicit: a limiter that itself makes a write on every
-- rate-limited request adds load to the primary datastore under exactly the
-- traffic pattern — bursts, retries, abuse — that a rate limiter exists to
-- absorb. `rate_limit_windows` and `rate_limit_cooldowns` are narrow, indexed
-- tables built for that write pattern, and `RateLimitCleanupJob` keeps them
-- from growing without bound, but the tradeoff against a store built for this
-- job is real and is recorded in the accompanying report, not just here.

-- Fixed-window counters: "at most N of these in a W-second window."
--
-- The window is identified by its own start time, not derived from `now()` at
-- query time, so that concurrent requests in the same window contend for the
-- same row rather than each computing a slightly different boundary. One row
-- per (key, window) pair; a key's row count is naturally bounded by how many
-- windows are still within retention, which the cleanup job enforces.
CREATE TABLE rate_limit_windows (
    id             uuid PRIMARY KEY,
    bucket_key     character varying(200) NOT NULL,
    window_start   timestamp(6) with time zone NOT NULL,
    hit_count      integer NOT NULL DEFAULT 0,
    created_at     timestamp(6) with time zone NOT NULL,
    updated_at     timestamp(6) with time zone NOT NULL
);

CREATE UNIQUE INDEX idx_rate_limit_windows_key_window
    ON rate_limit_windows USING btree (bucket_key, window_start);

-- Supports the cleanup job's delete-by-age and, incidentally, nothing else —
-- reads always go through the unique (key, window) pair above.
CREATE INDEX idx_rate_limit_windows_window_start
    ON rate_limit_windows USING btree (window_start);

-- Single-flight cooldowns: "not again within C seconds of the last one."
--
-- One row per key, updated in place — there is no history to keep, only the
-- most recent hit, so this table cannot grow per request the way an
-- unbounded log of send attempts would. That bound is itself part of the
-- defence this migration exists for: an attacker retrying against the same
-- address must not be able to grow a table linearly with their own requests.
CREATE TABLE rate_limit_cooldowns (
    bucket_key     character varying(200) PRIMARY KEY,
    last_hit_at    timestamp(6) with time zone NOT NULL
);

-- Supports the cleanup job's delete-by-age for cooldown rows whose cooldown
-- has long since elapsed and will not be consulted again soon.
CREATE INDEX idx_rate_limit_cooldowns_last_hit_at
    ON rate_limit_cooldowns USING btree (last_hit_at);
