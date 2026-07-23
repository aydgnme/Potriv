package me.aydgn.potriv.ops.monitor;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Dedicated security boundary for the embedded monitor console, completely
 * independent from the JWT/Bearer API chain. The chain matches only
 * {@code /admin/**} (context-relative) and uses HTTP Basic with the explicit
 * credentials from {@link BackendMonitorProperties}, backed by a self-contained
 * {@link AuthenticationManager} so it shares nothing with the API security.
 *
 * When the console is disabled the chain permits the requests so the MVC layer
 * can answer with an anti-leak 404 instead of a revealing 401.
 */
@Configuration
public class BackendMonitorSecurityConfig {

    @Bean
    @Order(0)
    public SecurityFilterChain backendMonitorFilterChain(
        HttpSecurity http,
        BackendMonitorProperties properties
    ) throws Exception {
        http
            .securityMatcher("/admin/**")
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        if (!properties.enabled()) {
            // Requests fall through to the controller, which returns 404.
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            return http.build();
        }

        if (!properties.hasCredentials()) {
            throw new IllegalStateException(
                "The backend monitor console is enabled without explicit credentials. Set "
                    + "BACKEND_CONSOLE_USERNAME and BACKEND_CONSOLE_PASSWORD, or disable "
                    + "the console.");
        }

        http
            .authenticationManager(monitorAuthenticationManager(properties))
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .httpBasic(basic -> {
            });

        return http.build();
    }

    private static AuthenticationManager monitorAuthenticationManager(
        BackendMonitorProperties properties) {
        // The console password is a plain runtime secret, so {noop}/NoOp keeps
        // the comparison direct without hashing an operator-supplied value.
        UserDetailsService users = new InMemoryUserDetailsManager(
            User.withUsername(properties.username())
                .password(properties.password())
                .roles("BACKEND_MONITOR")
                .build());
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(users);
        provider.setPasswordEncoder(NoOpPasswordEncoder.getInstance());
        return new ProviderManager(List.of(provider));
    }
}
