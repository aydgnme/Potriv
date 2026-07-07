package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;

@Entity
@Table(
    name = "refresh_tokens",
    indexes = {
        @Index(name = "idx_refresh_tokens_session_id", columnList = "session_id"),
        @Index(name = "idx_refresh_tokens_token_hash", columnList = "token_hash")
    }
)
public class RefreshToken extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private UserSession session;

    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(nullable = false)
    private OffsetDateTime expiresAt;

    @Column(nullable = true)
    private OffsetDateTime usedAt;

    @Column(nullable = true)
    private OffsetDateTime revokedAt;

    @Column(nullable = true)
    private UUID replacedByTokenId;

    protected RefreshToken() {
    }

    public RefreshToken(UserSession session, String tokenHash, OffsetDateTime expiresAt) {
        this.session = session;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public UserSession getSession() {
        return session;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public OffsetDateTime getUsedAt() {
        return usedAt;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public UUID getReplacedByTokenId() {
        return replacedByTokenId;
    }

    public boolean isExpired() {
        return OffsetDateTime.now(ZoneOffset.UTC).isAfter(expiresAt);
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public void markUsed(UUID newTokenId) {
        this.usedAt = OffsetDateTime.now(ZoneOffset.UTC);
        this.replacedByTokenId = newTokenId;
    }

    public void revoke() {
        if (revokedAt == null) {
            revokedAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }
}
