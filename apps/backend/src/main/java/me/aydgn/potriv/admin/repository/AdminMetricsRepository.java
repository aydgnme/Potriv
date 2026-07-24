package me.aydgn.potriv.admin.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import me.aydgn.potriv.project.entity.Project;

/**
 * Aggregate counts for the admin dashboard. Bound to {@link Project} for
 * Spring Data plumbing, but every method is an explicit JPQL count so no
 * entity graph is loaded.
 */
public interface AdminMetricsRepository extends Repository<Project, UUID> {

    long count();

    @Query("select count(p) from Project p "
        + "where p.status in (me.aydgn.potriv.project.entity.ProjectStatus.STARTING, "
        + "me.aydgn.potriv.project.entity.ProjectStatus.IN_PROGRESS, "
        + "me.aydgn.potriv.project.entity.ProjectStatus.CLOSING)")
    long countActiveProjects();

    @Query("select count(a) from ProjectAllocation a where a.deallocatedAt is null")
    long countActiveAllocations();

    @Query("select count(p) from ProjectAssignmentProposal p "
        + "where p.status = me.aydgn.potriv.allocation.entity.AssignmentProposalStatus.PENDING")
    long countPendingAssignmentProposals();

    @Query("select count(p) from ProjectDeallocationProposal p "
        + "where p.status = me.aydgn.potriv.allocation.entity.DeallocationProposalStatus.PENDING")
    long countPendingDeallocationProposals();

    @Query("select count(i) from InviteToken i where i.active = true")
    long countActiveInvitations();
}
