package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds the link somebody follows to set a new password.
 *
 * The token goes in the URL fragment, for the same reason the invite's does: a
 * fragment is never sent to a server, so it cannot reach an access log, a
 * reverse proxy, a platform trace or a {@code Referer} header. The previous
 * {@code ?token=} form reached all of them — and a reset token is a credential
 * that takes over an existing account, so it is the more dangerous of the two
 * to leave in a query string.
 *
 * Deliberately a sibling of {@link InviteUrlFactory} rather than a shared
 * helper with a path argument: there are exactly two of these links, each is
 * read by one page, and a single "build a token link" abstraction would invite
 * a third caller to be added without anyone deciding it should exist.
 */
@Component
public class PasswordResetUrlFactory {

    private final String frontendUrl;

    public PasswordResetUrlFactory(@Value("${app.frontend-url}") String frontendUrl) {
        this.frontendUrl = frontendUrl;
    }

    public String build(String rawToken) {
        return frontendUrl + "/reset-password#token=" + rawToken;
    }
}
