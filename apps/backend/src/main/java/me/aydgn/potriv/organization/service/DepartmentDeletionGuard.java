package me.aydgn.potriv.organization.service;

import java.util.UUID;

/**
 * Extension point that lets other modules block destructive department deletion
 * when they hold dependent data. Implementations throw a
 * {@link me.aydgn.potriv.common.exception.ConflictException} when the department
 * still has dependencies. This keeps the organization module free of direct
 * dependencies on those other modules.
 */
public interface DepartmentDeletionGuard {

    void verifyDeletable(UUID departmentId);
}
