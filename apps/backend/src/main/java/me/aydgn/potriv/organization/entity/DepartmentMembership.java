package me.aydgn.potriv.organization.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;

/**
 * Explicit association between a department and one of its members. It is the
 * single source of truth for a user's department: unique {@code member_user_id}
 * enforces that a user belongs to at most one department. Membership is
 * independent of manager assignment.
 */
@Entity
@Table(
    name = "department_memberships",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_dept_membership_member",
            columnNames = {"member_user_id"}
        )
    },
    indexes = {
        @Index(name = "idx_dept_memberships_department_id", columnList = "department_id")
    }
)
public class DepartmentMembership extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_user_id", nullable = false)
    private User member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assigned_by_user_id", nullable = false)
    private User assignedBy;

    protected DepartmentMembership() {
    }

    public DepartmentMembership(Department department, User member, User assignedBy) {
        this.department = department;
        this.member = member;
        this.assignedBy = assignedBy;
    }

    public Department getDepartment() {
        return department;
    }

    public User getMember() {
        return member;
    }

    public User getAssignedBy() {
        return assignedBy;
    }
}
