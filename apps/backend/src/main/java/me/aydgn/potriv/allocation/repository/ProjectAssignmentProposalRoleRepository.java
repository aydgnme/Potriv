package me.aydgn.potriv.allocation.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;

public interface ProjectAssignmentProposalRoleRepository
    extends JpaRepository<ProjectAssignmentProposalRole, UUID> {

    @Query("select r from ProjectAssignmentProposalRole r "
        + "join fetch r.teamRole "
        + "where r.proposal.id = :proposalId "
        + "order by r.teamRole.name asc, r.teamRole.id asc")
    List<ProjectAssignmentProposalRole> findByProposalIdWithTeamRole(
        @Param("proposalId") UUID proposalId);

    @Query("select r from ProjectAssignmentProposalRole r "
        + "join fetch r.teamRole "
        + "where r.proposal.id in :proposalIds "
        + "order by r.teamRole.name asc, r.teamRole.id asc")
    List<ProjectAssignmentProposalRole> findByProposalIdsWithTeamRole(
        @Param("proposalIds") Collection<UUID> proposalIds);

    // Bulk cleanup for all proposals of a project, used by project-delete integration.
    @Modifying
    @Query("delete from ProjectAssignmentProposalRole r "
        + "where r.proposal.id in (select p.id from ProjectAssignmentProposal p "
        + "where p.project.id = :projectId)")
    void deleteByProjectId(@Param("projectId") UUID projectId);
}
