package me.aydgn.potriv.ops.schema;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Development-only schema drift diagnostics.
 *
 * <p>Both flags default to {@code false}, so the detector is inert unless a
 * profile opts in — {@code application-dev.yml} does. Production must never rely
 * on this: there the schema is owned by Flyway and validated by Hibernate.
 *
 * @param enabled  run the check at startup
 * @param failFast refuse to start when drift is found, instead of only warning
 */
@ConfigurationProperties(prefix = "potriv.dev.schema-drift")
public record DevSchemaDriftProperties(boolean enabled, boolean failFast) {
}
