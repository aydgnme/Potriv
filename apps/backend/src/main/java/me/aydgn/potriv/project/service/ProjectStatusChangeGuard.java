package me.aydgn.potriv.project.service;

import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Extension point letting other modules veto a project status change before it
 * is applied, without the project module depending on them. Called by
 * {@code ProjectService.update(...)} before a real status transition is applied.
 * Implementations throw a {@link me.aydgn.potriv.common.exception.ConflictException}
 * to block the change, leaving the project (and its status history) unchanged.
 */
public interface ProjectStatusChangeGuard {

    void beforeStatusChange(Project project, ProjectStatus newStatus);
}
