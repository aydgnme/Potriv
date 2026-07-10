package me.aydgn.potriv.project.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.project.entity.ProjectTeamRoleRequirement;

public interface ProjectTeamRoleRequirementRepository
    extends JpaRepository<ProjectTeamRoleRequirement, UUID> {

    @Query("select r from ProjectTeamRoleRequirement r "
        + "join fetch r.teamRole "
        + "where r.project.id = :projectId "
        + "order by r.teamRole.name asc")
    List<ProjectTeamRoleRequirement> findByProjectIdWithTeamRole(@Param("projectId") UUID projectId);

    @Query("select r from ProjectTeamRoleRequirement r "
        + "join fetch r.teamRole "
        + "where r.project.id in :projectIds "
        + "order by r.teamRole.name asc")
    List<ProjectTeamRoleRequirement> findByProjectIdsWithTeamRole(
        @Param("projectIds") Collection<UUID> projectIds);

    void deleteByProject_Id(UUID projectId);
}
