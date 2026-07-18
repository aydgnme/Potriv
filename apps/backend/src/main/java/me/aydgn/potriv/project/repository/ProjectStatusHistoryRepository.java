package me.aydgn.potriv.project.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;

public interface ProjectStatusHistoryRepository extends JpaRepository<ProjectStatusHistory, UUID> {

    boolean existsByProject_IdAndToStatusIn(UUID projectId, Collection<ProjectStatus> statuses);

    List<ProjectStatusHistory> findByProject_IdOrderByCreatedAtAsc(UUID projectId);

    void deleteByProject_Id(UUID projectId);
}
