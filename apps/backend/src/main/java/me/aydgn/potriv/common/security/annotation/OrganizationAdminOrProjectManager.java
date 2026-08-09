package me.aydgn.potriv.common.security.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Readable by whoever owns the vocabulary and whoever has to use it.
 *
 * <p>The team-role catalogue belongs to the organization admin, but a project
 * manager cannot state a project's role requirements without first seeing the
 * catalogue those requirements are drawn from. This grants the reading, not the
 * owning: writes stay on {@link OrganizationAdminOnly}.
 *
 * <p>{@code SYSTEM_ADMIN} is included for the same reason every annotation here
 * includes it, and gains nothing by it — a platform admin resolves no current
 * organization, so an organization-scoped read still fails at that step.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ORGANIZATION_ADMIN', 'PROJECT_MANAGER')")
public @interface OrganizationAdminOrProjectManager {
}
