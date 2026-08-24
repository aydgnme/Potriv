package me.aydgn.potriv.identity.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Confirms a workspace registration.
 *
 * The token travels here as a body field, never a query or path parameter —
 * the frontend reads it from the URL fragment {@link
 * me.aydgn.potriv.identity.service.RegistrationVerificationUrlFactory} built,
 * exactly as {@link RegisterEmployeeRequest} and {@link
 * PasswordResetConfirmRequest} already do.
 */
public record RegisterAdminConfirmRequest(
    @NotBlank
    String token
) {
}
