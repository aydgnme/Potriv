package me.aydgn.potriv.organization.dto;

import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

/**
 * Safe user projection for unassigned-employee and department-member listings.
 * Exposes only identity fields and access roles — never security internals.
 */
public record DepartmentUserResponse(
    UUID userId,
    String name,
    String email,
    List<AccessRole> accessRoles
) {

}
