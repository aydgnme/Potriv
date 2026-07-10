package me.aydgn.potriv.project.dto;

import java.util.UUID;

/**
 * Safe projection of the project manager. Never exposes password, session,
 * token or account-lock fields.
 */
public record ProjectManagerSummary(
    UUID userId,
    String name,
    String email
) {

}
