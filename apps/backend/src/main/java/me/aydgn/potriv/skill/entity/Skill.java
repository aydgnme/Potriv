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
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Organization;

/**
 * Organization-scoped catalog skill authored by a Department Manager. Uniqueness
 * is per (organization, category, normalizedName). The author is the creator and
 * is immutable; only the author may update or (soft-)delete the skill.
 */
@Entity
@Table(
    name = "skills",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_skills_organization_category_normalized_name",
            columnNames = {"organization_id", "skill_category_id", "normalized_name"}
        )
    },
    indexes = {
        @Index(name = "idx_skills_organization_id", columnList = "organization_id"),
        @Index(name = "idx_skills_category_id", columnList = "skill_category_id"),
        @Index(name = "idx_skills_author_id", columnList = "author_user_id")
    }
)
public class Skill extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "skill_category_id", nullable = false)
    private SkillCategory category;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 160)
    private String normalizedName;

    @Column(nullable = true, length = 4000)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_user_id", nullable = false)
    private User author;

    @Column(nullable = false)
    private boolean active = true;

    protected Skill() {
    }

    public Skill(
        Organization organization,
        SkillCategory category,
        String name,
        String normalizedName,
        String description,
        User author
    ) {
        this.organization = organization;
        this.category = category;
        this.name = name;
        this.normalizedName = normalizedName;
        this.description = description;
        this.author = author;
        this.active = true;
    }

    public Organization getOrganization() {
        return organization;
    }

    public SkillCategory getCategory() {
        return category;
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

    public User getAuthor() {
        return author;
    }

    public boolean isActive() {
        return active;
    }

    public void changeCategory(SkillCategory category) {
        this.category = category;
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
