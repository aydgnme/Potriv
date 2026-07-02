package me.aydgn.potriv.identity.entity;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.organization.entity.Organization;

@Entity
@Table(
    name = "invite_tokens",
    indexes = {
        @Index(name = "idx_invite_tokens_token", columnList = "token"),
        @Index(name = "idx_invite_tokens_organization_id", columnList = "organization_id")
    }
)
public class InviteToken extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, unique = true, length = 120)
    private String token;

    @Column(nullable = true)
    private OffsetDateTime expiresAt;

    @Column(nullable = false)
    private boolean active = true;

    protected InviteToken() {
    }

    public InviteToken(
        Organization organization,
        String token,
        OffsetDateTime expiresAt
    ) {
        this.organization = organization;
        this.token = token;
        this.expiresAt = expiresAt;
        this.active = true;
    }

    public Organization getOrganization() {
        return organization;
    }

    public String getToken() {
        return token;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public boolean isActive() {
        return active;
    }

    public boolean isExpired() {
        return expiresAt != null && OffsetDateTime.now().isAfter(expiresAt);
    }

    public boolean isUsable() {
        return active && !isExpired();
    }

    public void deactivate() {
        this.active = false;
    }
}