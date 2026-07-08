package me.aydgn.potriv.organization.dto;

import java.util.UUID;

/**
 * Safe projection of a department manager. Never exposes password hash, login
 * lockout, token, session, or any other security internals.
 */
public record DepartmentManagerSummary(
    UUID userId,
    String name,
    String email
) {

}
