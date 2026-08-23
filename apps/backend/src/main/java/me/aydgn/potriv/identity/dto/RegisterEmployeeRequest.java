package me.aydgn.potriv.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Joining an organization with an invitation.
 *
 * The invite token is a field of this body, not a path variable and not a query
 * parameter. A URL is the most widely copied part of a request: it is written to
 * the access log of every server and proxy that handles it, appears in platform
 * traces and metrics, and is echoed back in error responses that report the path
 * that failed. A request body is none of those things — it is read once by the
 * handler and not recorded anywhere in this application.
 *
 * The token is therefore carried the same way the password below it is, and for
 * the same reason: both are credentials, and neither belongs in a URL.
 */
public record RegisterEmployeeRequest(

    @Schema(
        description = "The invitation's token, taken from the emailed link's fragment.",
        // Swagger renders examples into public API documentation, so this one is
        // deliberately not shaped like a real token.
        example = "<the token from the invitation email>")
    @NotBlank
    @Size(max = 512)
    String token,

    @NotBlank
    @Size(max = 120)
    String name,

    @NotBlank
    @Email
    @Size(max = 180)
    String email,

    @NotBlank
    @Size(min = 8, max = 72)
    String password
) {

}
