package me.aydgn.potriv.admin.security;

import java.util.UUID;

/**
 * Authenticated admin session principal. Carries only safe display fields —
 * never the password hash, tokens, or other security internals.
 */
public record AdminPrincipal(UUID userId, String name, String email) {
}
