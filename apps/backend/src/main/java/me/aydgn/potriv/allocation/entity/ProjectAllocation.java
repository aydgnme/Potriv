package me.aydgn.potriv.allocation.entity;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.project.entity.Project;

/**
 * An active (or historically ended) allocation of an employee to a project,
 * created when a Department Manager accepts an assignment proposal. An allocation
 * is active while {@code deallocatedAt} is null. There is intentionally no
 * permanent {@code (project, employee)} uniqueness — a user may be allocated,
 * deallocated and re-allocated as a new episode — but at most one active
 * allocation per (project, employee) is enforced transactionally. Roles are not
 * stored here; they are resolved through the approved proposal's role snapshot.
 */
@Entity
@Table(
    name = "project_allocations",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_project_allocations_assignment_proposal",
            columnNames = {"assignment_proposal_id"}
        )
    },
    indexes = {
        @Index(name = "idx_project_allocations_project_id", columnList = "project_id"),
        @Index(name = "idx_project_allocations_employee_user_id", columnList = "employee_user_id"),
        @Index(name = "idx_project_allocations_deallocated_at", columnList = "deallocated_at")
    }
)
public class ProjectAllocation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_user_id", nullable = false)
    private User employee;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assignment_proposal_id", nullable = false)
    private ProjectAssignmentProposal assignmentProposal;

    @Column(name = "work_hours_per_day", nullable = false)
    private int workHoursPerDay;

    @Column(name = "allocated_at", nullable = false)
    private OffsetDateTime allocatedAt;

    @Column(name = "deallocated_at", nullable = true)
    private OffsetDateTime deallocatedAt;

    protected ProjectAllocation() {
    }

    public ProjectAllocation(
        Project project,
        User employee,
        ProjectAssignmentProposal assignmentProposal,
        int workHoursPerDay,
        OffsetDateTime allocatedAt
    ) {
        this.project = project;
        this.employee = employee;
        this.assignmentProposal = assignmentProposal;
        this.workHoursPerDay = workHoursPerDay;
        this.allocatedAt = allocatedAt;
    }

    public Project getProject() {
        return project;
    }

    public User getEmployee() {
        return employee;
    }

    public ProjectAssignmentProposal getAssignmentProposal() {
        return assignmentProposal;
    }

    public int getWorkHoursPerDay() {
        return workHoursPerDay;
    }

    public OffsetDateTime getAllocatedAt() {
        return allocatedAt;
    }

    public OffsetDateTime getDeallocatedAt() {
        return deallocatedAt;
    }

    public boolean isActive() {
        return deallocatedAt == null;
    }
}
