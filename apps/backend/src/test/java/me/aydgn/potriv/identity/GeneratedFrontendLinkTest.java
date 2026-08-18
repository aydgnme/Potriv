package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.service.InviteTokenService;
import me.aydgn.potriv.organization.entity.Organization;

/**
 * The links this backend emails to people who cannot yet sign in.
 *
 * Both are built by string concatenation from {@code app.frontend-url}, which
 * means a wrong base silently produces a link that resolves to nothing. That is
 * exactly what happened: the property pointed at {@code localhost:5173}, an
 * origin no application in this repository serves, so invite links had no
 * destination and development reset links were dead.
 *
 * These tests pin the *shape* — base URL, path, and the token carried as a
 * {@code token} query parameter — without asserting the token's contents, which
 * are random by design and must stay that way.
 */
class GeneratedFrontendLinkTest {

    private static final String FRONTEND_URL = "https://potriv.example";

    @Test
    @DisplayName("an invite URL is the configured frontend base plus /invite?token=")
    void inviteUrlUsesConfiguredFrontendBase() {
        // No repository is needed: building a URL is pure string work and never
        // touches persistence. Passing null keeps a mocking framework — and its
        // generated classes — out of a test that does not need either.
        InviteTokenService service = new InviteTokenService(null, FRONTEND_URL);

        Organization organization = new Organization("Example", "1 Example Way");
        InviteToken token = new InviteToken(organization, "a-token-value", null);

        String url = service.buildInviteUrl(token);

        assertThat(url).startsWith(FRONTEND_URL + "/invite?token=");
        // The token travels as a query parameter, not a path segment: the Next
        // route reads `?token=`, and the two must agree.
        assertThat(url).contains("?token=");
        assertThat(url).doesNotContain("localhost:5173");
    }

    @Test
    @DisplayName("the invite URL carries the token it was built from")
    void inviteUrlCarriesItsToken() {
        // No repository is needed: building a URL is pure string work and never
        // touches persistence. Passing null keeps a mocking framework — and its
        // generated classes — out of a test that does not need either.
        InviteTokenService service = new InviteTokenService(null, FRONTEND_URL);

        String tokenValue = UUID.randomUUID().toString();
        InviteToken token = new InviteToken(
            new Organization("Example", "1 Example Way"),
            tokenValue,
            null
        );

        assertThat(service.buildInviteUrl(token)).isEqualTo(
            FRONTEND_URL + "/invite?token=" + tokenValue
        );
    }

    @Test
    @DisplayName("a trailing slash in configuration would double the separator")
    void baseUrlIsUsedVerbatim() {
        InviteTokenService service = new InviteTokenService(null, FRONTEND_URL + "/");

        InviteToken token = new InviteToken(
            new Organization("Example", "1 Example Way"),
            "t",
            null
        );

        // Documenting the real behaviour rather than pretending it normalises:
        // the service concatenates, so configuration must not end in a slash.
        assertThat(service.buildInviteUrl(token)).isEqualTo(FRONTEND_URL + "//invite?token=t");
    }
}
