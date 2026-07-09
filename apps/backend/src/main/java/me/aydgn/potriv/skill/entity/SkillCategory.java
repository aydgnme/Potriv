package me.aydgn.potriv.skill.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.organization.entity.Organization;

/**
 * Reusable, organization-owned skill category (for example "Programming Language"
 * or "Database"). It is owned by the organization, not by any individual author:
 * every manager in the organization reuses the same categories.
 */
@Entity
@Table(
    name = "skill_categories",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_skill_categories_organization_normalized_name",
            columnNames = {"organization_id", "normalized_name"}
        )
    },
    indexes = {
        @Index(name = "idx_skill_categories_organization_id", columnList = "organization_id")
    }
)
public class SkillCategory extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 120)
    private String normalizedName;

    @Column(nullable = false)
    private boolean active = true;

    protected SkillCategory() {
    }

    public SkillCategory(Organization organization, String name, String normalizedName) {
        this.organization = organization;
        this.name = name;
        this.normalizedName = normalizedName;
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

    public boolean isActive() {
        return active;
    }

    public void rename(String name, String normalizedName) {
        this.name = name;
        this.normalizedName = normalizedName;
    }

    public void activate() {
        this.active = true;
    }

    public void deactivate() {
        this.active = false;
    }
}
