package me.aydgn.potriv.identity.entity;

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

    public boolean belongsToOrganization() {
        return organization != null;
    }

    public boolean isPlatformUser() {
        return organization == null;
    }
}
