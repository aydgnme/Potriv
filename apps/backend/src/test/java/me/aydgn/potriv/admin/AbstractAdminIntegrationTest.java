package me.aydgn.potriv.admin;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Base for admin-UI integration tests. Enables the admin console and signs in
 * through the real form-login flow as the seeded {@code SYSTEM_ADMIN}, reusing
 * the resulting HTTP session for subsequent requests. No HTTP Basic, no machine
 * environment.
 */
@TestPropertySource(properties = "potriv.backend-console.enabled=true")
public abstract class AbstractAdminIntegrationTest extends AbstractMockMvcIntegrationTest {

    private MockHttpSession adminSession;

    /** Performs a fresh form login as the seeded system admin. */
    protected MockHttpSession loginAsSystemAdmin() throws Exception {
        MvcResult result = mockMvc.perform(formLogin("/admin/login")
                .user(SYSTEM_ADMIN_EMAIL).password(SYSTEM_ADMIN_PASSWORD))
            .andExpect(authenticated())
            .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    /** A cached authenticated admin session for the current test. */
    protected MockHttpSession adminSession() throws Exception {
        if (adminSession == null) {
            adminSession = loginAsSystemAdmin();
        }
        return adminSession;
    }

    protected ResultActions adminGet(String path) throws Exception {
        return mockMvc.perform(authorized(get(path)));
    }

    /** Attaches the authenticated admin session to a request builder. */
    protected MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder builder)
        throws Exception {
        return builder.session(adminSession());
    }
}
