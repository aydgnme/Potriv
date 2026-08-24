package me.aydgn.potriv.common.ratelimit;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import me.aydgn.potriv.common.audit.BaseEntity;

/**
 * The JPA shape of {@code rate_limit_windows} — not the read/write path.
 *
 * {@link RateLimitStore} does all of its actual work through {@link
 * org.springframework.jdbc.core.JdbcTemplate}, one atomic {@code INSERT ...
 * ON CONFLICT ... RETURNING} per operation: that is what makes the increment
 * safe across every application instance sharing this database, and there is
 * no idiomatic way to express it through JPA's entity lifecycle. This class
 * exists only so the table has a mapping at all — the test suite builds its
 * schema from entity mappings with no Flyway involved
 * ({@code spring.jpa.hibernate.ddl-auto: create-drop} in
 * {@code application-test.yml}), and {@code V10__rate_limiting.sql} is what
 * production actually runs. The two must describe the same table; nothing
 * here is read or written through this class's own fields.
 */
@Entity
@Table(
    name = "rate_limit_windows",
    uniqueConstraints = @UniqueConstraint(columnNames = {"bucket_key", "window_start"}),
    indexes = @Index(name = "idx_rate_limit_windows_window_start", columnList = "window_start")
)
class RateLimitWindowRow extends BaseEntity {

    @Column(name = "bucket_key", nullable = false, length = 200)
    private String bucketKey;

    @Column(name = "window_start", nullable = false)
    private OffsetDateTime windowStart;

    @Column(name = "hit_count", nullable = false)
    private int hitCount;

    protected RateLimitWindowRow() {
    }
}
