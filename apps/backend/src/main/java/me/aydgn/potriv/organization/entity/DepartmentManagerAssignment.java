package me.aydgn.potriv.organization.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;

/**
 * Explicit association between a department and its single manager. Database
 * uniqueness enforces the cardinality: a department has at most one manager
 * (unique {@code department_id}) and a user manages at most one department
 * (unique {@code manager_user_id}).
 */
@Entity
@Table(
    name = "department_manager_assignments",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_dept_manager_assignment_department",
            columnNames = {"department_id"}
        ),
        @UniqueConstraint(
            name = "uq_dept_manager_assignment_manager",
            columnNames = {"manager_user_id"}
        )
    }
)
public class DepartmentManagerAssignment extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "manager_user_id", nullable = false)
    private User manager;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assigned_by_user_id", nullable = false)
    private User assignedBy;

    protected DepartmentManagerAssignment() {
    }

    public DepartmentManagerAssignment(Department department, User manager, User assignedBy) {
        this.department = department;
        this.manager = manager;
        this.assignedBy = assignedBy;
    }

    public Department getDepartment() {
        return department;
    }

    public User getManager() {
        return manager;
    }

    public User getAssignedBy() {
        return assignedBy;
    }
}
