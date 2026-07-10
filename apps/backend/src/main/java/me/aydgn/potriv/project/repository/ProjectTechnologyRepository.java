package me.aydgn.potriv.project.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.project.entity.ProjectTechnology;

public interface ProjectTechnologyRepository extends JpaRepository<ProjectTechnology, UUID> {

    List<ProjectTechnology> findByProject_IdOrderByNameAsc(UUID projectId);

    void deleteByProject_Id(UUID projectId);

    @Query("select t from ProjectTechnology t where t.project.id in :projectIds order by t.name asc")
    List<ProjectTechnology> findByProjectIds(@Param("projectIds") Collection<UUID> projectIds);
}
