package me.aydgn.potriv.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;

/**
 * Organization-defined informational team role (for example "Backend Developer"
 * or "Scrum Master"). It is distinct from {@code AccessRole}: it never grants
 * application permissions and must never be used as a Spring Security authority.
 */
@Entity
@Table(
    name = "team_roles",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_team_roles_organization_normalized_name",
            columnNames = {"organization_id", "normalized_name"}
        )
    },
    indexes = {
        @Index(name = "idx_team_roles_organization_id", columnList = "organization_id")
    }
)
public class TeamRole extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 120)
    private String normalizedName;

    @Column(nullable = true, length = 1000)
    private String description;

    @Column(nullable = false)
    private boolean active = true;

    protected TeamRole() {
    }

    public TeamRole(Organization organization, String name, String normalizedName, String description) {
        this.organization = organization;
        this.name = name;
        this.normalizedName = normalizedName;
        this.description = description;
        this.active = true;
    }

    public Organization getOrganization() {
        return organization;
    }

    public String getName() {
        return name;
    }

    public String getNormalizedName() {
        return normalizedName;
    }

    public String getDescription() {
        return description;
    }

    public boolean isActive() {
        return active;
    }

    public void rename(String name, String normalizedName) {
        this.name = name;
        this.normalizedName = normalizedName;
    }

    public void changeDescription(String description) {
        this.description = description;
    }

    public void activate() {
        this.active = true;
    }

    public void deactivate() {
        this.active = false;
    }
}
