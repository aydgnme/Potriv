package me.aydgn.potriv.identity.entity;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.hibernate.annotations.ColumnDefault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.organization.entity.Organization;

@Entity
@Table(
    name = "users",
    indexes = {
        @Index(name = "idx_users_organization_id", columnList = "organization_id"),
        @Index(name = "idx_users_email", columnList = "email")
    }
)
public class User extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "organization_id", nullable = true)
    private Organization organization;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 180)
    private String email;

    @Column(nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @ColumnDefault("'ACTIVE'")
    private AccessAccountStatus status = AccessAccountStatus.ACTIVE;

    @Column(nullable = false)
    @ColumnDefault("0")
    private int failedLoginAttempts = 0;

    @Column(nullable = true)
    private OffsetDateTime lockedUntil;

    protected User() {
    }
    
    public User(Organization organization, String name, String email, String passwordHash) {
        this.organization = organization;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public Organization getOrganization() {
        return organization;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void updateProfile(String name) {
        this.name = name;
    }

    public void changePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public AccessAccountStatus getStatus() {
        return status;
    }

    public void changeStatus(AccessAccountStatus newStatus) {
        this.status = newStatus;
    }

    public boolean isActive() {
        return status == AccessAccountStatus.ACTIVE;
    }

    public int getFailedLoginAttempts() {
        return failedLoginAttempts;
    }

    public OffsetDateTime getLockedUntil() {
        return lockedUntil;
    }

    public boolean isLoginLocked() {
        return lockedUntil != null
            && OffsetDateTime.now(ZoneOffset.UTC).isBefore(lockedUntil);
    }

    public void registerFailedLogin(int maxFailedAttempts, Duration lockDuration) {
        failedLoginAttempts++;

        if (failedLoginAttempts >= maxFailedAttempts) {
            lockedUntil = OffsetDateTime.now(ZoneOffset.UTC).plus(lockDuration);
            failedLoginAttempts = 0;
        }
    }

    public void resetLoginFailures() {
        failedLoginAttempts = 0;
        lockedUntil = null;
    }

    public boolean belongsToOrganization() {
        return organization != null;
    }

    public boolean isPlatformUser() {
        return organization == null;
    }
}
