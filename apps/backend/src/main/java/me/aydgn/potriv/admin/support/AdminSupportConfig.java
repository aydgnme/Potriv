package me.aydgn.potriv.admin.support;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Exposes admin formatting helpers to Thymeleaf as the {@code @adminFormat} bean.
 */
@Configuration
public class AdminSupportConfig {

    @Bean
    public AdminFormat adminFormat() {
        return new AdminFormat();
    }
}
