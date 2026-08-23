package me.aydgn.potriv.identity.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An issued invite, as the administrator's browser is allowed to see it.
 *
 * There is no link and no token here, in any response. The raw value exists
 * only inside the request that created it, long enough to be written into one
 * email, and is then dropped: the store holds a SHA-256, so nothing can produce
 * it again. An administrator who needs the recipient to have a working link
 * re-invites them, which sends a new mail.
 *
 * The address is masked. An admin listing invitations does not need the full
 * address to recognise one, and a screenshot or a shoulder-surfer should not
 * harvest a directory from it.
 */
public record EmployeeInviteResponse(
    UUID inviteId,
    String maskedEmail,
    InviteStatus status,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt
) {

    public enum InviteStatus {
        PENDING,
        ACCEPTED,
        EXPIRED,
        REVOKED
    }

    /**
     * {@code alice.smith@example.com} becomes {@code al****@example.com}.
     *
     * Enough to recognise an invitation you just sent, not enough to read a
     * directory off the screen. A very short local part is masked entirely
     * rather than leaked by the two-character prefix.
     */
    public static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 0) {
            return "****";
        }
        String local = email.substring(0, at);
        String domain = email.substring(at);
        String visible = local.length() <= 2 ? "" : local.substring(0, 2);
        return visible + "****" + domain;
    }
}
