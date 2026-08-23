package me.aydgn.potriv.identity.dto;

import java.util.UUID;

/**
 * What creating a workspace returns.
 *
 * No invite link. Invites are addressed to a person now, and at registration
 * there is nobody to address — the admin invites each employee by email, and
 * that response is the only place a link ever appears.
 */
public record RegisterAdminResponse(
    UUID organizationId,
    UUID userId
) {
}
