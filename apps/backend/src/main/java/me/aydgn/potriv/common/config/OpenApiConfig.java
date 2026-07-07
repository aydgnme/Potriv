package me.aydgn.potriv.common.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.ExternalDocumentation;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_SECURITY_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI potrivOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("Potriv API")
                .description("Backend API for Potriv, a team allocation and skill matching platform.")
                .version("0.1.0")
                .contact(new Contact()
                    .name("Mert Aydogan")
                    .url("https://aydgn.me"))
                .license(new License()
                    .name("MIT")))
            .servers(List.of(
                new Server()
                    .url("http://localhost:8080/api")
                    .description("Local development API"),
                new Server()
                    .url("https://api.potriv.aydgn.me/api")
                    .description("Production API")
            ))
            .components(new Components()
                .addSecuritySchemes(
                    BEARER_SECURITY_SCHEME,
                    new SecurityScheme()
                        .name(BEARER_SECURITY_SCHEME)
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                ))
            // Security is declared per operation via @SecurityRequirement so
            // public endpoints such as login, registration, refresh, and
            // password reset are not documented as Bearer-secured.
            .externalDocs(new ExternalDocumentation()
                .description("Potriv Repository")
                .url("https://github.com/aydgnme/Potriv"));
    }
}
