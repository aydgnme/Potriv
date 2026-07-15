package me.aydgn.potriv.allocation.entity;

import java.time.OffsetDateTime;

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
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.project.entity.Project;

/**
 * A Project Manager's proposal to assign an employee to a project for review by
 * the employee's department. The {@code reviewDepartment} is a snapshot captured
 * from the employee's membership at proposal time. There is intentionally no
 * permanent {@code (project, employee)} uniqueness: a rejected proposal or a past
 * allocation must not permanently block a later proposal. The transactional
 * invariant is at most one PENDING proposal per project + employee.
 */
@Entity
@Table(
    name = "project_assignment_proposals",
    indexes = {
        @Index(name = "idx_project_assignment_proposals_project_id", columnList = "project_id"),
        @Index(name = "idx_project_assignment_proposals_employee_user_id",
            columnList = "employee_user_id"),
        @Index(name = "idx_project_assignment_proposals_review_department_id",
            columnList = "review_department_id"),
        @Index(name = "idx_project_assignment_proposals_status", columnList = "status")
    }
)
public class ProjectAssignmentProposal extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_user_id", nullable = false)
    private User employee;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "review_department_id", nullable = false)
    private Department reviewDepartment;

    @Column(name = "work_hours_per_day", nullable = false)
    private int workHoursPerDay;

    @Column(nullable = true, length = 5000)
    private String comments;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AssignmentProposalStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposed_by_user_id", nullable = false)
    private User proposedBy;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "reviewed_by_user_id", nullable = true)
    private User reviewedBy;

    @Column(name = "reviewed_at", nullable = true)
    private OffsetDateTime reviewedAt;

    protected ProjectAssignmentProposal() {
    }

    public ProjectAssignmentProposal(
        Project project,
        User employee,
        Department reviewDepartment,
        int workHoursPerDay,
        String comments,
        AssignmentProposalStatus status,
        User proposedBy
    ) {
        this.project = project;
        this.employee = employee;
        this.reviewDepartment = reviewDepartment;
        this.workHoursPerDay = workHoursPerDay;
        this.comments = comments;
        this.status = status;
        this.proposedBy = proposedBy;
    }

    public Project getProject() {
        return project;
    }

    public User getEmployee() {
        return employee;
    }

    public Department getReviewDepartment() {
        return reviewDepartment;
    }

    public int getWorkHoursPerDay() {
        return workHoursPerDay;
    }

    public String getComments() {
        return comments;
    }

    public AssignmentProposalStatus getStatus() {
        return status;
    }

    public User getProposedBy() {
        return proposedBy;
    }

    public User getReviewedBy() {
        return reviewedBy;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public boolean isPending() {
        return status == AssignmentProposalStatus.PENDING;
    }

    public void approve(User reviewedBy, OffsetDateTime reviewedAt) {
        this.status = AssignmentProposalStatus.APPROVED;
        this.reviewedBy = reviewedBy;
        this.reviewedAt = reviewedAt;
    }

    public void reject(User reviewedBy, OffsetDateTime reviewedAt) {
        this.status = AssignmentProposalStatus.REJECTED;
        this.reviewedBy = reviewedBy;
        this.reviewedAt = reviewedAt;
    }
}
