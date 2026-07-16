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

/**
 * A Project Manager's proposal to end an active allocation, reviewed by the
 * employee's department. The {@code reviewDepartment} is a snapshot captured
 * from the employee's membership at proposal time. The allocation reference is
 * intentionally {@code ManyToOne}: one allocation may accumulate several
 * historical proposals over time (a rejected proposal never permanently blocks
 * a later one); only one PENDING proposal per active allocation is enforced by
 * the workflow. Project, employee and hours are reachable through the
 * allocation and are not duplicated here.
 */
@Entity
@Table(
    name = "project_deallocation_proposals",
    indexes = {
        @Index(name = "idx_project_deallocation_proposals_allocation_id",
            columnList = "allocation_id"),
        @Index(name = "idx_project_deallocation_proposals_review_department_id",
            columnList = "review_department_id"),
        @Index(name = "idx_project_deallocation_proposals_status", columnList = "status")
    }
)
public class ProjectDeallocationProposal extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "allocation_id", nullable = false)
    private ProjectAllocation allocation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "review_department_id", nullable = false)
    private Department reviewDepartment;

    @Column(nullable = false, length = 5000)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DeallocationProposalStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposed_by_user_id", nullable = false)
    private User proposedBy;

    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "reviewed_by_user_id", nullable = true)
    private User reviewedBy;

    @Column(name = "reviewed_at", nullable = true)
    private OffsetDateTime reviewedAt;

    protected ProjectDeallocationProposal() {
    }

    public ProjectDeallocationProposal(
        ProjectAllocation allocation,
        Department reviewDepartment,
        String reason,
        DeallocationProposalStatus status,
        User proposedBy
    ) {
        this.allocation = allocation;
        this.reviewDepartment = reviewDepartment;
        this.reason = reason;
        this.status = status;
        this.proposedBy = proposedBy;
    }

    public ProjectAllocation getAllocation() {
        return allocation;
    }

    public Department getReviewDepartment() {
        return reviewDepartment;
    }

    public String getReason() {
        return reason;
    }

    public DeallocationProposalStatus getStatus() {
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
        return status == DeallocationProposalStatus.PENDING;
    }

    public void approve(User reviewedBy, OffsetDateTime reviewedAt) {
        this.status = DeallocationProposalStatus.APPROVED;
        this.reviewedBy = reviewedBy;
        this.reviewedAt = reviewedAt;
    }

    public void reject(User reviewedBy, OffsetDateTime reviewedAt) {
        this.status = DeallocationProposalStatus.REJECTED;
        this.reviewedBy = reviewedBy;
        this.reviewedAt = reviewedAt;
    }
}
