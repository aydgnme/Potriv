package me.aydgn.potriv.identity.dto;

import java.util.UUID;

/**
 * What confirming a workspace registration returns.
 *
 * Only reached once a caller has presented a valid, single-use verification
 * token — see {@code AuthRegistrationService#confirmRegistration} — so
 * returning identifiers here does not reopen the enumeration question the
 * request endpoint closes: proving ownership of the token already proves
 * ownership of the address.
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
