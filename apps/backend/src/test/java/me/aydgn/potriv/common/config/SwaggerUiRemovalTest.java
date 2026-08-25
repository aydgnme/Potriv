package me.aydgn.potriv.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Proves the interactive Swagger UI dependency is actually gone from the
 * runtime, independently of any HTTP status. An HTTP probe cannot do this
 * reliably here: an authenticated request to a genuinely nonexistent path in
 * this application returns 401 (not 404), because Spring's internal forward
 * to /error runs unauthenticated regardless of the original request's
 * credentials — see the note on
 * {@code JwtRbacSecurityIntegrationTest#swaggerUiIsNotPubliclyExposedToAnonymousRequests}.
 * A 404-over-HTTP assertion would therefore prove nothing meaningful either
 * way. This checks the actual classpath instead: springdoc's removed -ui
 * starter pulled in {@code org.webjars:swagger-ui}, which places its static
 * assets (index.html, the bundled JS — including a vendored DOMPurify copy)
 * under {@code META-INF/resources/webjars/swagger-ui/<version>/}. If that
 * dependency were ever reintroduced, real files would appear there; this
 * test fails the moment they do, without needing to know or hard-code the
 * version.
 */
class SwaggerUiRemovalTest {

    @Test
    void noSwaggerUiWebjarResourcesOnTheRuntimeClasspath() throws Exception {
        Resource[] resources = new PathMatchingResourcePatternResolver()
            .getResources("classpath*:/META-INF/resources/webjars/swagger-ui/**");

        assertThat(resources)
            .as("swagger-ui webjar resources on the classpath")
            .isEmpty();
    }
}
