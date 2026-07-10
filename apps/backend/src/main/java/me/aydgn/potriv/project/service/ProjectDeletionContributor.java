package me.aydgn.potriv.project.service;

import java.util.UUID;

/**
 * Extension point that lets other modules clean up their own data before a
 * project is deleted, without the project module depending on them. Called
 * inside the delete transaction after the project's own eligibility checks pass
 * and before the project's own rows are removed.
 */
public interface ProjectDeletionContributor {

    void beforeProjectDelete(UUID projectId);
}
