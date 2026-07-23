package me.aydgn.potriv.admin.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;

public interface AdminProjectRepository extends Repository<Project, UUID> {

    @Query(value = "select p from Project p "
        + "left join fetch p.projectManager left join fetch p.organization "
        + "where lower(p.name) like :pattern "
        + "and (:status is null or p.status = :status)",
        countQuery = "select count(p) from Project p "
            + "where lower(p.name) like :pattern "
            + "and (:status is null or p.status = :status)")
    Page<Project> search(
        @Param("pattern") String pattern, @Param("status") ProjectStatus status,
        Pageable pageable);

    @Query("select p from Project p "
        + "left join fetch p.projectManager left join fetch p.organization "
        + "where p.id = :id")
    Optional<Project> findDetailById(@Param("id") UUID id);

    @Query("select t.project.id, count(t) from ProjectTechnology t "
        + "where t.project.id in :ids group by t.project.id")
    List<Object[]> countTechnologiesByProjectIds(@Param("ids") Collection<UUID> ids);

    @Query("select a.project.id, count(a) from ProjectAllocation a "
        + "where a.project.id in :ids and a.deallocatedAt is null group by a.project.id")
    List<Object[]> countActiveAllocationsByProjectIds(@Param("ids") Collection<UUID> ids);

    @Query("select count(p) from ProjectAssignmentProposal p "
        + "where p.project.id = :projectId "
        + "and p.status = me.aydgn.potriv.allocation.entity.AssignmentProposalStatus.PENDING")
    long countPendingAssignmentProposals(@Param("projectId") UUID projectId);

    @Query("select count(p) from ProjectDeallocationProposal p "
        + "where p.allocation.project.id = :projectId "
        + "and p.status = me.aydgn.potriv.allocation.entity.DeallocationProposalStatus.PENDING")
    long countPendingDeallocationProposals(@Param("projectId") UUID projectId);
}
