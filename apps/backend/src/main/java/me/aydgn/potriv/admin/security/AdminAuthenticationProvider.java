package me.aydgn.potriv.admin.security;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.authentication.WebAuthenticationDetails;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Spring Security provider for the admin form login. Delegates credential and
 * role verification to {@link AdminAuthenticationService} and, on success,
 * issues an authentication carrying the {@link AdminPrincipal} and the single
 * {@code ROLE_SYSTEM_ADMIN} authority.
 */
@Component
public class AdminAuthenticationProvider implements AuthenticationProvider {

    private static final SimpleGrantedAuthority SYSTEM_ADMIN =
        new SimpleGrantedAuthority("ROLE_SYSTEM_ADMIN");

    private final AdminAuthenticationService authenticationService;
    private final ObjectProvider<HttpServletRequest> requestProvider;

    public AdminAuthenticationProvider(
        AdminAuthenticationService authenticationService,
        ObjectProvider<HttpServletRequest> requestProvider
    ) {
        this.authenticationService = authenticationService;
        this.requestProvider = requestProvider;
    }

    @Override
    public Authentication authenticate(Authentication authentication)
        throws AuthenticationException {
        String email = authentication.getName();
        String password = authentication.getCredentials() == null
            ? null : authentication.getCredentials().toString();

        AdminPrincipal principal = authenticationService.authenticate(
            email, password, userAgent(), ipAddress(authentication));

        return new UsernamePasswordAuthenticationToken(
            principal, null, List.of(SYSTEM_ADMIN));
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }

    private String ipAddress(Authentication authentication) {
        if (authentication.getDetails() instanceof WebAuthenticationDetails details) {
            return details.getRemoteAddress();
        }
        return null;
    }

    private String userAgent() {
        HttpServletRequest request = requestProvider.getIfAvailable();
        return request == null ? null : request.getHeader("User-Agent");
    }
}
