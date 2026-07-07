package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

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
    name = "user_sessions",
    indexes = {
        @Index(name = "idx_user_sessions_user_id", columnList = "user_id")
    }
)
public class UserSession extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = true)
    private OffsetDateTime revokedAt;

    @Column(nullable = false)
    private OffsetDateTime lastSeenAt;

    @Column(nullable = true, length = 255)
    private String userAgent;

    @Column(nullable = true, length = 64)
    private String ipAddress;

    protected UserSession() {
    }

    public UserSession(User user, String userAgent, String ipAddress) {
        this.user = user;
        this.userAgent = userAgent;
        this.ipAddress = ipAddress;
        this.lastSeenAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public User getUser() {
        return user;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public OffsetDateTime getLastSeenAt() {
        return lastSeenAt;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public void revoke() {
        if (revokedAt == null) {
            revokedAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }

    public void touch() {
        lastSeenAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
