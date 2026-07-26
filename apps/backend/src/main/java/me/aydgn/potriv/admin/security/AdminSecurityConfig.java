package me.aydgn.potriv.admin.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

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
 */
@Configuration
public class AdminSecurityConfig {

    @Bean
    @Order(0)
    public SecurityFilterChain adminFilterChain(
        HttpSecurity http,
        BackendMonitorProperties properties,
        AdminAuthenticationProvider adminAuthenticationProvider,
        AdminAccessDeniedHandler adminAccessDeniedHandler
    ) throws Exception {
        http.securityMatcher("/admin/**");

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
