package me.aydgn.potriv.admin.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.NegatedRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

import me.aydgn.potriv.ops.monitor.BackendMonitorProperties;

/**
 * Security boundary for the embedded admin UI ({@code /admin/**}, externally
 * {@code /api/admin/**}). Replaces the former HTTP Basic ops gate with a
 * server-side session form login backed by the existing Potriv user model.
 * Completely independent from the JWT/Bearer API chain (which stays stateless
 * with CSRF disabled) — an admin session never authenticates the REST API.
 *
 * <p>Only {@code ROLE_SYSTEM_ADMIN} may reach admin pages; the login page and
 * admin static assets are anonymous. When the console is disabled the chain
 * permits requests so the MVC layer can answer an anti-leak 404.
 *
 * <p><strong>Two REST operations also live under {@code /admin/**}</strong> and
 * are deliberately excluded from this chain — see {@link #REST_API_UNDER_ADMIN}.
 */
@Configuration
public class AdminSecurityConfig {

    /**
     * The Bearer-JWT REST operations that happen to sit under {@code /admin/**}:
     * {@code AdminSecurityAuditController} and the status endpoint of
     * {@code AdminUserController}.
     *
     * <p>They are ordinary API operations — declared in OpenAPI, guarded by
     * {@code @SystemAdminOnly}, called with a token. Left inside this chain they
     * were handed to a session filter that has no idea what a Bearer token is, so
     * enabling the console answered them with a login redirect or a 403 and
     * silently removed two documented operations from the API.
     *
     * <p>Excluding them here sends them to the stateless REST chain, where their
     * method security applies as it does everywhere else. The exclusion is narrow
     * on purpose: {@code /admin/users} is shared with the console's own pages, and
     * only the {@code PATCH} belongs to the API — every console GET/POST under
     * that prefix stays behind the session login.
     */
    private static final RequestMatcher REST_API_UNDER_ADMIN = new OrRequestMatcher(
        PathPatternRequestMatcher.withDefaults().matcher("/admin/security/**"),
        PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.PATCH, "/admin/users/*/status"));

    @Bean
    @Order(0)
    public SecurityFilterChain adminFilterChain(
        HttpSecurity http,
        BackendMonitorProperties properties,
        AdminAuthenticationProvider adminAuthenticationProvider,
        AdminAccessDeniedHandler adminAccessDeniedHandler
    ) throws Exception {
        http.securityMatcher(new AndRequestMatcher(
            PathPatternRequestMatcher.withDefaults().matcher("/admin/**"),
            new NegatedRequestMatcher(REST_API_UNDER_ADMIN)));

        if (!properties.enabled()) {
            // Disabled: requests fall through to controllers, which 404.
            http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            return http.build();
        }

        http
            .authenticationProvider(adminAuthenticationProvider)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/admin/login").permitAll()
                .requestMatchers("/admin/css/**", "/admin/js/**").permitAll()
                .anyRequest().hasRole("SYSTEM_ADMIN"))
            .formLogin(form -> form
                .loginPage("/admin/login")
                .loginProcessingUrl("/admin/login")
                .defaultSuccessUrl("/admin", true)
                .failureUrl("/admin/login?error")
                .permitAll())
            .logout(logout -> logout
                .logoutUrl("/admin/logout")
                .logoutSuccessUrl("/admin/login?logout")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID"))
            .exceptionHandling(ex -> ex.accessDeniedHandler(adminAccessDeniedHandler))
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                .sessionFixation(fixation -> fixation.newSession()));
        // CSRF stays enabled (default) for the admin chain.

        return http.build();
    }
}
