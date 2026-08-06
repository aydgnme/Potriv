package me.aydgn.potriv.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * The production SMTP transport contract.
 *
 * <p>Mail is sent <em>synchronously</em> inside the password-reset request, and
 * submission carries a credential. Both facts make these settings load-bearing:
 * without bounded timeouts a hung SMTP server holds an HTTP thread until the
 * pool is gone, and without required STARTTLS the credential can cross the wire
 * in plaintext the moment a server stops advertising TLS.
 *
 * <p>Asserted against the shipped {@code application-prod.yml} rather than a
 * booted context, so the file itself is the thing under test — a loosened value
 * fails here even if no test ever boots the prod profile.
 */
class ProductionMailTransportTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> smtpProperties() throws IOException {
        try (InputStream yaml = ProductionMailTransportTest.class
            .getResourceAsStream("/application-prod.yml")) {
            Map<String, Object> root = new Yaml().load(yaml);
            Map<String, Object> mail =
                (Map<String, Object>) ((Map<String, Object>) root.get("spring")).get("mail");
            Map<String, Object> properties = (Map<String, Object>) mail.get("properties");
            return (Map<String, Object>) ((Map<String, Object>) properties.get("mail")).get("smtp");
        }
    }

    @Test
    void submissionRequiresAuthenticationAndStartTls() throws IOException {
        Map<String, Object> smtp = smtpProperties();

        assertThat(smtp.get("auth")).isEqualTo(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> starttls = (Map<String, Object>) smtp.get("starttls");
        assertThat(starttls.get("enable")).isEqualTo(true);
        // Required, not merely enabled: a server that stops advertising STARTTLS
        // must fail the send rather than silently downgrade to plaintext.
        assertThat(starttls.get("required")).isEqualTo(true);
    }

    @Test
    void everyTimeoutIsBounded() throws IOException {
        Map<String, Object> smtp = smtpProperties();

        // Each is an environment placeholder with a finite default. JavaMail's own
        // defaults are unbounded, which is the failure mode being prevented.
        for (String key : new String[] {"connectiontimeout", "timeout", "writetimeout"}) {
            String value = String.valueOf(smtp.get(key));
            assertThat(value)
                .as("%s must be configured with a finite default", key)
                .matches("\\$\\{[A-Z_]+:\\d+}");
            int fallback = Integer.parseInt(value.replaceAll(".*:(\\d+)}", "$1"));
            assertThat(fallback).isPositive().isLessThanOrEqualTo(30_000);
        }
    }

    /**
     * Certificate validation must never be switched off. {@code ssl.trust=*} is
     * the usual shortcut when a self-hosted certificate misbehaves, and it turns
     * authenticated submission into an unauthenticated one for any attacker on
     * the path.
     */
    @Test
    void certificateValidationIsNeverDisabled() throws IOException {
        Map<String, Object> smtp = smtpProperties();

        assertThat(smtp).doesNotContainKey("ssl");
        assertThat(String.valueOf(smtp)).doesNotContain("trust");
    }
}
