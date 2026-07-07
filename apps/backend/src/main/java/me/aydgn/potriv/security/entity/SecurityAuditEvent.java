package me.aydgn.potriv.security.entity;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;

// Audit history intentionally stores plain identifier columns instead of JPA
// relationships so records survive user deletion or deactivation.
@Entity
@Table(
    name = "security_audit_events",
    indexes = {
        @Index(name = "idx_security_audit_events_event_type", columnList = "event_type"),
        @Index(name = "idx_security_audit_events_user_id", columnList = "user_id"),
        @Index(name = "idx_security_audit_events_organization_id", columnList = "organization_id"),
        @Index(name = "idx_security_audit_events_created_at", columnList = "created_at")
    }
)
public class SecurityAuditEvent extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 60)
    private SecurityAuditEventType eventType;

    @Column(name = "user_id", nullable = true)
    private UUID userId;

    @Column(name = "organization_id", nullable = true)
    private UUID organizationId;

    @Column(nullable = true)
    private UUID sessionId;

    @Column(nullable = true)
    private UUID actorUserId;

    @Column(nullable = true, length = 180)
    private String normalizedEmail;

    @Column(nullable = true, length = 64)
    private String ipAddress;

    @Column(nullable = true, length = 255)
    private String userAgent;

    @Column(nullable = false)
    private boolean success;

    @Column(nullable = true, columnDefinition = "TEXT")
    private String details;

    protected SecurityAuditEvent() {
    }

    private SecurityAuditEvent(Builder builder) {
        this.eventType = builder.eventType;
        this.userId = builder.userId;
        this.organizationId = builder.organizationId;
        this.sessionId = builder.sessionId;
        this.actorUserId = builder.actorUserId;
        this.normalizedEmail = builder.normalizedEmail;
        this.ipAddress = builder.ipAddress;
        this.userAgent = builder.userAgent;
        this.success = builder.success;
        this.details = builder.details;
    }

    public static Builder builder(SecurityAuditEventType eventType, boolean success) {
        return new Builder(eventType, success);
    }

    public SecurityAuditEventType getEventType() {
        return eventType;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public String getNormalizedEmail() {
        return normalizedEmail;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public boolean isSuccess() {
        return success;
    }

    public String getDetails() {
        return details;
    }

    public static final class Builder {

        private final SecurityAuditEventType eventType;
        private final boolean success;
        private UUID userId;
        private UUID organizationId;
        private UUID sessionId;
        private UUID actorUserId;
        private String normalizedEmail;
        private String ipAddress;
        private String userAgent;
        private String details;

        private Builder(SecurityAuditEventType eventType, boolean success) {
            this.eventType = eventType;
            this.success = success;
        }

        public Builder userId(UUID userId) {
            this.userId = userId;
            return this;
        }

        public Builder organizationId(UUID organizationId) {
            this.organizationId = organizationId;
            return this;
        }

        public Builder sessionId(UUID sessionId) {
            this.sessionId = sessionId;
            return this;
        }

        public Builder actorUserId(UUID actorUserId) {
            this.actorUserId = actorUserId;
            return this;
        }

        public Builder normalizedEmail(String normalizedEmail) {
            this.normalizedEmail = normalizedEmail;
            return this;
        }

        public Builder ipAddress(String ipAddress) {
            this.ipAddress = ipAddress;
            return this;
        }

        public Builder userAgent(String userAgent) {
            this.userAgent = userAgent;
            return this;
        }

        public Builder details(String details) {
            this.details = details;
            return this;
        }

        public SecurityAuditEvent build() {
            return new SecurityAuditEvent(this);
        }
    }
}
