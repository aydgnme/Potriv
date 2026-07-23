package me.aydgn.potriv.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Base for admin-UI integration tests. Enables the backend console (which also
 * gates the admin UI) with fixed HTTP Basic credentials from test properties —
 * no machine environment involved.
 */
@TestPropertySource(properties = {
    "potriv.backend-console.enabled=true",
    "potriv.backend-console.username=admin",
    "potriv.backend-console.password=admin-console-password"
})
public abstract class AbstractAdminIntegrationTest extends AbstractMockMvcIntegrationTest {

    protected static final String ADMIN_USER = "admin";
    protected static final String ADMIN_PASSWORD = "admin-console-password";

    protected static String basic(String username, String password) {
        return "Basic " + Base64.getEncoder().encodeToString(
            (username + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    protected ResultActions adminGet(String path) throws Exception {
        return mockMvc.perform(authorized(get(path)));
    }

    protected MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder builder) {
        return builder.header(HttpHeaders.AUTHORIZATION, basic(ADMIN_USER, ADMIN_PASSWORD));
    }
}
