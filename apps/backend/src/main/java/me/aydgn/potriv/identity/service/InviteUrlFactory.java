package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds the link an invited employee follows.
 *
 * The token goes in the URL fragment, not the query string or the path. A
 * fragment is never sent to a server, so it cannot reach an access log, a
 * reverse proxy, Application Insights or a `Referer` header — all of which
 * recorded the previous `?token=` form. The frontend reads it once and clears
 * it from the address bar.
 */
@Component
public class InviteUrlFactory {

    private final String frontendUrl;

    public InviteUrlFactory(@Value("${app.frontend-url}") String frontendUrl) {
        this.frontendUrl = frontendUrl;
    }

    public String build(String rawToken) {
        return frontendUrl + "/invite#token=" + rawToken;
    }
}
