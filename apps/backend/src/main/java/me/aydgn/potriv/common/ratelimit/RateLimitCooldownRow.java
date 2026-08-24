package me.aydgn.potriv.common.ratelimit;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * The JPA shape of {@code rate_limit_cooldowns} — see {@link
 * RateLimitWindowRow} for why this exists and why nothing reads or writes
 * through it: all real access goes through {@link RateLimitStore}'s own
 * {@code JdbcTemplate} statements.
 */
@Entity
@Table(
    name = "rate_limit_cooldowns",
    indexes = @Index(name = "idx_rate_limit_cooldowns_last_hit_at", columnList = "last_hit_at")
)
class RateLimitCooldownRow {

    @Id
    @Column(name = "bucket_key", length = 200)
    private String bucketKey;

    @Column(name = "last_hit_at", nullable = false)
    private OffsetDateTime lastHitAt;

    protected RateLimitCooldownRow() {
    }
}
