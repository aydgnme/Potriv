package me.aydgn.potriv.common.exception;

import java.time.OffsetDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * The error envelope every API failure is rendered into.
 *
 * {@code code} is present only where a client is expected to branch on the
 * outcome, and omitted otherwise — so adding it did not change the shape of
 * every existing error response.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(
    OffsetDateTime timestamp,
    int status,
    String error,
    String message,
    String path,
    String code
) {
}