package me.aydgn.potriv.skill.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Department;

/**
 * Explicit association linking a skill to a department where it is used. Unique
 * {@code (skill_id, department_id)} prevents duplicate links. A link never
 * assigns the skill to department members.
 */
@Entity
@Table(
    name = "skill_department_links",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_skill_department_links_skill_department",
            columnNames = {"skill_id", "department_id"}
        )
    },
    indexes = {
        @Index(name = "idx_skill_department_links_skill_id", columnList = "skill_id"),
        @Index(name = "idx_skill_department_links_department_id", columnList = "department_id")
    }
)
public class SkillDepartmentLink extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "skill_id", nullable = false)
    private Skill skill;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "linked_by_user_id", nullable = false)
    private User linkedBy;

    protected SkillDepartmentLink() {
    }

    public SkillDepartmentLink(Skill skill, Department department, User linkedBy) {
        this.skill = skill;
        this.department = department;
        this.linkedBy = linkedBy;
    }

    public Skill getSkill() {
        return skill;
    }

    public Department getDepartment() {
        return department;
    }

    public User getLinkedBy() {
        return linkedBy;
    }
}
