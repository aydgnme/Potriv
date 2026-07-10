package me.aydgn.potriv.project.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    Optional<Project> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    List<Project> findByProjectManager_IdOrderByCreatedAtDesc(UUID projectManagerUserId);

    List<Project> findByProjectManager_IdAndStatusOrderByCreatedAtDesc(
        UUID projectManagerUserId, ProjectStatus status);
}
