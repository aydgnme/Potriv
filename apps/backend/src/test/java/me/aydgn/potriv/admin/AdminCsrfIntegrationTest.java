package me.aydgn.potriv.admin;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

/**
 * CSRF protection on the admin POST endpoints (login and logout).
 */
class AdminCsrfIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void loginWithoutCsrfIsRejected() throws Exception {
        mockMvc.perform(post("/admin/login")
                .param("username", SYSTEM_ADMIN_EMAIL)
                .param("password", SYSTEM_ADMIN_PASSWORD))
            .andExpect(status().isForbidden())
            .andExpect(unauthenticated());
    }

    @Test
    void loginWithCsrfSucceeds() throws Exception {
        // formLogin() includes a valid CSRF token.
        mockMvc.perform(formLogin("/admin/login")
                .user(SYSTEM_ADMIN_EMAIL).password(SYSTEM_ADMIN_PASSWORD))
            .andExpect(authenticated());
    }

    @Test
    void logoutWithoutCsrfIsRejected() throws Exception {
        MockHttpSession session = adminSession();
        mockMvc.perform(post("/admin/logout").session(session))
            .andExpect(status().isForbidden());
        // The session is still valid (logout was not performed).
        mockMvc.perform(get("/admin").session(session)).andExpect(status().isOk());
    }

    @Test
    void logoutWithCsrfLogsOut() throws Exception {
        MockHttpSession session = adminSession();
        mockMvc.perform(post("/admin/logout").with(csrf()).session(session))
            .andExpect(status().is3xxRedirection())
            .andExpect(unauthenticated());
    }

    @Test
    void getLogoutIsNotSupported() throws Exception {
        // Logout is POST-only; a GET is not a logout action.
        MockHttpSession session = adminSession();
        mockMvc.perform(get("/admin/logout").session(session))
            .andExpect(status().isNotFound());
    }
}
