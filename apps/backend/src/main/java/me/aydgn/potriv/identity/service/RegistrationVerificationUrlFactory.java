package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds the link an applicant follows to confirm their address and finish
 * creating a workspace.
 *
 * The token goes in the URL fragment, exactly like {@link InviteUrlFactory}
 * and {@link PasswordResetUrlFactory}: a fragment is never sent to a server,
 * so it cannot reach an access log, a reverse proxy, Application Insights, or
 * a {@code Referer} header.
 */
@Component
public class RegistrationVerificationUrlFactory {

    private final String frontendUrl;

    public RegistrationVerificationUrlFactory(@Value("${app.frontend-url}") String frontendUrl) {
        this.frontendUrl = frontendUrl;
    }

    public String build(String rawToken) {
        return frontendUrl + "/create-workspace/verify#token=" + rawToken;
    }
}
