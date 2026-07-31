package me.aydgn.potriv.ops.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * The drift detector must stay a development tool. These are plain unit tests on
 * the shipped configuration, so they cannot be affected by whatever profile the
 * rest of the suite happens to run under.
 */
class DevSchemaDriftDefaultsTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> schemaDriftSection(String resource) {
        try (InputStream input =
                 DevSchemaDriftDefaultsTest.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) {
                return Map.of();
            }
            Map<String, Object> root = new Yaml().load(input);
            Map<String, Object> potriv = (Map<String, Object>) root.get("potriv");
            if (potriv == null) {
                return Map.of();
            }
            Map<String, Object> dev = (Map<String, Object>) potriv.get("dev");
            if (dev == null) {
                return Map.of();
            }
            return (Map<String, Object>) dev.getOrDefault("schema-drift", Map.of());
        } catch (Exception exception) {
            throw new IllegalStateException("Could not read " + resource, exception);
        }
    }

    @Test
    void disabledByDefaultSoProductionAndTestsNeverRunIt() {
        Map<String, Object> defaults = schemaDriftSection("application.yml");

        assertThat(defaults.get("enabled")).isEqualTo(false);
        assertThat(defaults.get("fail-fast")).isEqualTo(false);
    }

    @Test
    void productionProfileDoesNotEnableIt() {
        // Production schema is owned by Flyway and validated by Hibernate; the
        // prod profile must not opt in, so the shared default (false) applies.
        assertThat(schemaDriftSection("application-prod.yml")).isEmpty();
    }

    @Test
    void developmentProfileEnablesItWithFailFast() {
        Map<String, Object> dev = schemaDriftSection("application-dev.yml");

        assertThat(dev.get("enabled")).isEqualTo(true);
        assertThat(dev.get("fail-fast")).isEqualTo(true);
    }

    @Test
    void propertiesRecordDefaultsToInert() {
        DevSchemaDriftProperties properties = new DevSchemaDriftProperties(false, false);

        assertThat(properties.enabled()).isFalse();
        assertThat(properties.failFast()).isFalse();
    }
}
