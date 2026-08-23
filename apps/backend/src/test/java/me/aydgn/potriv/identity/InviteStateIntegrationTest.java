package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

/**
 * What state an invitation is in, and who agrees about it.
 *
 * There used to be three answers. The entity called an invitation usable when
 * it was active, unexpired and unspent; the re-invite path swept every
 * {@code active} row for an address; and the admin console derived
 * ACTIVE / EXPIRED / DISABLED from {@code active} alone, with no notion of a
 * spent invitation at all.
 *
 * The consequences were not cosmetic. Redemption set {@code consumedAt} but
 * left {@code active} true, so an accepted invitation stayed "active" in the
 * console's count — and re-inviting the same person reached that row and
 * stamped {@code revokedAt} onto it, relabelling somebody's completed
 * registration as an administrative withdrawal.
 *
 * One predicate now, on the entity, and every caller asks it there.
 */
class InviteStateIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("an accepted invitation is not outstanding, and is not counted as one")
    void acceptedInvitationIsNotPending() throws Exception {
        Fixture fixture = accepted();

        InviteToken invite = reload(fixture.rawToken());

        assertThat(invite.isPending()).isFalse();
        assertThat(invite.status()).isEqualTo(InviteToken.Status.ACCEPTED);
        assertThat(inviteTokenRepository.findPendingFor(fixture.organization())).isEmpty();
    }

    @Test
    @DisplayName("redemption leaves no row that is both spent and active")
    void redemptionLeavesAConsistentRow() throws Exception {
        accepted();

        /*
          Asked of the database rather than the entity: the contradiction this
          fixes was a persisted one, and a getter could hide it behind derived
          logic.
        */
        Integer contradictory = jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens where consumed_at is not null and active",
            Integer.class);

        assertThat(contradictory).isZero();
    }

    @Test
    @DisplayName("an expired invitation is not outstanding either")
    void expiredInvitationIsNotPending() throws Exception {
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);
        Organization organization = organizationRepository
            .findById(UUID.fromString(admin.get("organizationId").asText())).orElseThrow();

        String email = uniqueEmail("employee");
        inviteEmployee(adminToken, email);
        InviteToken invite = reload(inviteTokenFromMailTo(email));

        jdbcTemplate.update("update invite_tokens set expires_at = ? where id = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(1), invite.getId());

        assertThat(inviteTokenRepository.findPendingFor(organization)).isEmpty();
        assertThat(reload(inviteTokenFromMailTo(email)).status())
            .isEqualTo(InviteToken.Status.EXPIRED);
    }

    @Test
    @DisplayName("re-inviting somebody does not rewrite the invitation they already accepted")
    void reinviteLeavesAcceptedHistoryAlone() throws Exception {
        Fixture fixture = accepted();
        InviteToken beforeReinvite = reload(fixture.rawToken());
        OffsetDateTime consumedAt = beforeReinvite.getConsumedAt();

        /*
          The address now belongs to a real account, so the invite endpoint
          refuses it — which is the point: the refusal must not have reached
          into the accepted row on its way out. The sweep runs before that
          check in the old code path, so this is the case that caught it.
        */
        inviteEmployeeExpecting(fixture.adminToken(), fixture.email(), 400);

        InviteToken after = reload(fixture.rawToken());
        assertThat(after.getRevokedAt()).isNull();
        assertThat(after.getConsumedAt()).isEqualTo(consumedAt);
        assertThat(after.status()).isEqualTo(InviteToken.Status.ACCEPTED);
    }

    @Test
    @DisplayName("withdrawing never reaches an invitation somebody already accepted")
    void revokingDoesNotRewriteAnAcceptedInvitation() throws Exception {
        Fixture fixture = accepted();
        InviteToken invite = reload(fixture.rawToken());

        invite.deactivate();
        inviteTokenRepository.save(invite);

        InviteToken after = reload(fixture.rawToken());
        assertThat(after.getRevokedAt()).isNull();
        assertThat(after.status()).isEqualTo(InviteToken.Status.ACCEPTED);
    }

    @Test
    @DisplayName("re-inviting withdraws only the invitation that was still outstanding")
    void reinviteWithdrawsOnlyTheOutstandingOne() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String email = uniqueEmail("employee");
        inviteEmployee(adminToken, email);
        String first = inviteTokenFromMailTo(email);

        inviteEmployee(adminToken, email);
        String second = inviteTokenFromMailTo(email);

        assertThat(reload(first).status()).isEqualTo(InviteToken.Status.REVOKED);
        assertThat(reload(first).getRevokedAt()).isNotNull();
        assertThat(reload(second).status()).isEqualTo(InviteToken.Status.PENDING);
    }

    // ---- helpers ----

    private record Fixture(Organization organization, String adminToken, String email,
                           String rawToken) {
    }

    /** An organization whose invitation to one address has been redeemed. */
    private Fixture accepted() throws Exception {
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);
        Organization organization = organizationRepository
            .findById(UUID.fromString(admin.get("organizationId").asText())).orElseThrow();

        String email = uniqueEmail("employee");
        inviteEmployee(adminToken, email);
        String rawToken = inviteTokenFromMailTo(email);
        registerEmployee(rawToken, email, PASSWORD);

        return new Fixture(organization, adminToken, email, rawToken);
    }

    private InviteToken reload(String rawToken) {
        return inviteTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(rawToken))
            .orElseThrow();
    }
}
