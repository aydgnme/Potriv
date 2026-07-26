package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

/**
 * Happy-path browser-session login: the styled login page, the anonymous
 * redirect, an authenticated session reaching admin pages and the monitor, and
 * logout.
 */
class AdminSessionLoginIntegrationTest extends AbstractAdminIntegrationTest {

    @Test
    void loginPageRenders() throws Exception {
        mockMvc.perform(get("/admin/login"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Sign in")));
    }

    @Test
    void anonymousAdminRedirectsToLogin() throws Exception {
        mockMvc.perform(get("/admin"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("**/admin/login"));
        mockMvc.perform(get("/admin/users"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("**/admin/login"));
    }

    @Test
    void systemAdminSessionReachesAdminPagesAndMonitor() throws Exception {
        MockHttpSession session = adminSession();
        mockMvc.perform(get("/admin").session(session)).andExpect(status().isOk());
        mockMvc.perform(get("/admin/users").session(session)).andExpect(status().isOk());
        String monitor = mockMvc.perform(get("/admin/monitor").session(session))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andReturn().getResponse().getContentAsString();
        assertThat(monitor).contains("Backend Monitor");
    }

    @Test
    void topbarShowsSignedInIdentityNotSecrets() throws Exception {
        String html = adminGet("/admin")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("SYSTEM_ADMIN", "Logout");
        assertThat(html).doesNotContain("passwordHash", "JSESSIONID", "refreshToken",
            "accessToken");
    }

    @Test
    void logoutInvalidatesSessionAndRedirects() throws Exception {
        MockHttpSession session = adminSession();
        mockMvc.perform(post("/admin/logout").with(csrf()).session(session))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/login?logout"))
            .andExpect(unauthenticated());
        // The invalidated session can no longer reach admin pages.
        mockMvc.perform(get("/admin").session(session))
            .andExpect(status().is3xxRedirection())
            .andExpect(header().string("Location", org.hamcrest.Matchers.containsString("/admin/login")));
    }
}
