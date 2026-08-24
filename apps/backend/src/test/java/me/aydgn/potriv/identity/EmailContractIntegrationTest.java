package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.support.EmailAddresses;

/**
 * One length, one normalisation, everywhere an address is handled.
 *
 * The invite endpoint accepted 320 characters — the RFC maximum — while
 * `users.email`, the registration request and the audit record all stop at 180.
 * An address between the two was accepted, issued a token, written to the
 * invite table and mailed, and then failed at redemption because the account it
 * was for could not be stored. The invitation was real, the recipient had a
 * working link, and the registration was impossible.
 *
 * Separately, three call sites lower-cased with the JVM's default locale.
 * Under a Turkish locale `I` maps to `ı`, so a backend started with
 * `-Duser.language=tr` normalised one way when issuing and another when
 * redeeming, and any address containing an `I` was unredeemable on that
 * deployment alone.
 */
class EmailContractIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * A syntactically valid address of exactly {@code length} characters.
     *
     * Composed rather than padded, because the validator enforces RFC structure
     * as well as total length: the local part may not exceed 64 characters and
     * a domain label may not exceed 63. A test that padded the local part to
     * 180 would be rejected for the wrong reason and would prove nothing about
     * the bound under test.
     */
    private static String addressOfLength(int length) {
        String local = ("u" + UUID.randomUUID().toString().replace("-", "")).substring(0, 32);
        local = local + "a".repeat(64 - local.length());          // exactly 64

        int domainLength = length - local.length() - 1;           // minus the '@'
        String suffix = ".test";
        int labels = domainLength - suffix.length();              // "aaa.bbb"
        int first = Math.min(63, labels - 1);
        String domain = "a".repeat(first) + "." + "b".repeat(labels - first - 1) + suffix;

        String address = local + "@" + domain;
        if (address.length() != length) {
            throw new IllegalStateException(
                "composed an address of " + address.length() + ", wanted " + length);
        }
        return address;
    }

    @Test
    @DisplayName("the accepted length is the length that can be stored")
    void theInviteBoundMatchesTheColumn() {
        assertThat(EmailAddresses.MAX_LENGTH).isEqualTo(180);

        Integer column = jdbcTemplate.queryForObject("""
            select character_maximum_length from information_schema.columns
             where table_schema = 'public' and table_name = 'users' and column_name = 'email'
            """, Integer.class);

        assertThat(column)
            .as("accepting more than the column holds is what created the unusable invitation")
            .isEqualTo(EmailAddresses.MAX_LENGTH);
    }

    @Test
    @DisplayName("an over-long address is refused before anything is created or sent")
    void anOverlongAddressIsRefusedBeforeTheMailServerIsInvolved() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        int before = recordingMailSender.getSentMessages().size();
        Integer invitesBefore = jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens", Integer.class);
        Integer auditBefore = jdbcTemplate.queryForObject(
            "select count(*) from security_audit_events", Integer.class);

        String tooLong = addressOfLength(EmailAddresses.MAX_LENGTH + 1);
        inviteEmployeeExpecting(adminToken, tooLong, 400);

        assertThat(recordingMailSender.getSentMessages()).hasSize(before);
        assertThat(jdbcTemplate.queryForObject("select count(*) from invite_tokens", Integer.class))
            .isEqualTo(invitesBefore);
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from security_audit_events", Integer.class))
            .isEqualTo(auditBefore);
    }

    @Test
    @DisplayName("the boundary value itself works end to end")
    void theLongestAllowedAddressCanBeInvitedAndRegistered() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        // Unique as well as exactly at the bound, so the run stays repeatable.
        String atTheBound = addressOfLength(EmailAddresses.MAX_LENGTH);
        assertThat(atTheBound).hasSize(EmailAddresses.MAX_LENGTH);

        inviteEmployee(adminToken, atTheBound);
        registerEmployee(inviteTokenFromMailTo(atTheBound), atTheBound, PASSWORD);

        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from users where email = ?", Integer.class, atTheBound))
            .isEqualTo(1);
    }

    @Test
    @DisplayName("normalisation does not depend on the machine's locale")
    void normalisationIsLocaleIndependent() {
        Locale previous = Locale.getDefault();
        try {
            /*
              The Turkish locale is the case that breaks a bare toLowerCase():
              it maps I to ı rather than i. If the helper used the default
              locale, the two lines below would disagree.
            */
            Locale.setDefault(Locale.forLanguageTag("tr"));
            String turkish = EmailAddresses.normalize("  Ian.Ismail@Potriv.TEST  ");

            Locale.setDefault(Locale.ROOT);
            String root = EmailAddresses.normalize("  Ian.Ismail@Potriv.TEST  ");

            assertThat(turkish).isEqualTo(root).isEqualTo("ian.ismail@potriv.test");
        } finally {
            Locale.setDefault(previous);
        }
    }
}
