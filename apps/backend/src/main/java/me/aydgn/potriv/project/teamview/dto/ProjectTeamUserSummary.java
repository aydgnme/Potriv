package me.aydgn.potriv.project.teamview.dto;

import java.util.UUID;

/**
 * Safe user projection — never exposes password, account-status, session or
 * token internals.
 */
public record ProjectTeamUserSummary(
    UUID userId,
    String name,
    String email
) {

}
