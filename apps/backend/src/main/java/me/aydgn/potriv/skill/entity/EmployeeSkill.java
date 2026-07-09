package me.aydgn.potriv.skill.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;

/**
 * A self-service assignment of a catalog skill to a user, with a proficiency
 * level and an experience bucket. Unique {@code (user_id, skill_id)} enforces
 * at most one assignment of a given skill per user.
 */
@Entity
@Table(
    name = "employee_skills",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_employee_skills_user_skill",
            columnNames = {"user_id", "skill_id"}
        )
    },
    indexes = {
        @Index(name = "idx_employee_skills_user_id", columnList = "user_id"),
        @Index(name = "idx_employee_skills_skill_id", columnList = "skill_id")
    }
)
public class EmployeeSkill extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "skill_id", nullable = false)
    private Skill skill;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SkillLevel level;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private SkillExperience experience;

    protected EmployeeSkill() {
    }

    public EmployeeSkill(User user, Skill skill, SkillLevel level, SkillExperience experience) {
        this.user = user;
        this.skill = skill;
        this.level = level;
        this.experience = experience;
    }

    public User getUser() {
        return user;
    }

    public Skill getSkill() {
        return skill;
    }

    public SkillLevel getLevel() {
        return level;
    }

    public SkillExperience getExperience() {
        return experience;
    }

    public void changeLevel(SkillLevel level) {
        this.level = level;
    }

    public void changeExperience(SkillExperience experience) {
        this.experience = experience;
    }
}
