package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import me.aydgn.potriv.identity.service.InviteUrlFactory;

/**
 * The links this backend emails to people who cannot yet sign in.
 *
 * Both are built by string concatenation from {@code app.frontend-url}, which
 * means a wrong base silently produces a link that resolves to nothing. That is
 * exactly what happened: the property pointed at {@code localhost:5173}, an
 * origin no application in this repository serves, so invite links had no
 * destination and development reset links were dead.
 *
 * These tests pin the *shape* — base URL, path, and how the token is carried —
 * without asserting the token's contents, which are random by design and must
 * stay that way.
 *
 * The invite's token now travels in the URL *fragment*. A fragment is never
 * sent to a server, so it cannot reach an access log, a reverse proxy, a
 * platform trace or a {@code Referer} header. The previous {@code ?token=}
 * form reached all of them.
 */
class GeneratedFrontendLinkTest {

    private static final String FRONTEND_URL = "https://potriv.example";

    @Test
    @DisplayName("an invite URL is the configured frontend base plus /invite#token=")
    void inviteUrlUsesConfiguredFrontendBase() {
        // Building a URL is pure string work and never touches persistence, so
        // this needs no repository and no mocking framework.
        InviteUrlFactory factory = new InviteUrlFactory(FRONTEND_URL);

        String url = factory.build("a-token-value");

        assertThat(url).startsWith(FRONTEND_URL + "/invite#token=");
        assertThat(url).contains("#token=");
        assertThat(url).doesNotContain("localhost:5173");
    }

    @Test
    @DisplayName("the invite token never appears in the query string or the path")
    void inviteTokenStaysOutOfTheServerVisiblePartOfTheUrl() {
        /*
          The point of the whole change. Everything before the '#' is sent to
          the server on every request for that page; everything after it never
          leaves the browser.
        */
        InviteUrlFactory factory = new InviteUrlFactory(FRONTEND_URL);
        String tokenValue = UUID.randomUUID().toString();

        String url = factory.build(tokenValue);
        String serverVisible = url.substring(0, url.indexOf('#'));

        assertThat(serverVisible).doesNotContain(tokenValue);
        assertThat(serverVisible).doesNotContain("token=");
        assertThat(serverVisible).isEqualTo(FRONTEND_URL + "/invite");
    }

    @Test
    @DisplayName("the invite URL carries the token it was built from")
    void inviteUrlCarriesItsToken() {
        InviteUrlFactory factory = new InviteUrlFactory(FRONTEND_URL);

        String tokenValue = UUID.randomUUID().toString();

        assertThat(factory.build(tokenValue))
            .isEqualTo(FRONTEND_URL + "/invite#token=" + tokenValue);
    }

    @Test
    @DisplayName("a trailing slash in configuration would double the separator")
    void baseUrlIsUsedVerbatim() {
        InviteUrlFactory factory = new InviteUrlFactory(FRONTEND_URL + "/");

        // Documenting the real behaviour rather than pretending it normalises:
        // the factory concatenates, so configuration must not end in a slash.
        assertThat(factory.build("t")).isEqualTo(FRONTEND_URL + "//invite#token=t");
    }
}
