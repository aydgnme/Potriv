package me.aydgn.potriv.skill.dto;

import java.util.UUID;

/**
 * Safe author projection. Never exposes password hash, session, token, or
 * account-lock fields.
 */
public record SkillAuthorRef(
    UUID userId,
    String name,
    String email
) {

}
