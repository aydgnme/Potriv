package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * A malformed id in an admin URL must render the console's own not-found page.
 *
 * <p>Path variables bind as {@code UUID}, so {@code /admin/users/not-a-uuid}
 * raised a {@code MethodArgumentTypeMismatchException}. {@code AdminErrorAdvice}
 * caught it under its {@code Exception} handler and rendered a **500**, telling
 * an operator the console had broken when they had simply mistyped a link. It is
 * now mapped to the same 404 an unknown id produces — which is also the answer
 * that reveals least about what exists.
 */
class AdminPathVariableHardeningIntegrationTest extends AbstractAdminIntegrationTest {

    private static final String BAD = "not-a-uuid";

    /** Every admin GET route that takes an id. */
    static Stream<String> detailRoutes() {
        return Stream.of(
            "/admin/users/" + BAD,
            "/admin/users/" + BAD + "/edit",
            "/admin/users/" + BAD + "/roles",
            "/admin/organizations/" + BAD,
            "/admin/organizations/" + BAD + "/edit",
            "/admin/departments/" + BAD,
            "/admin/departments/" + BAD + "/edit",
            "/admin/departments/" + BAD + "/delete",
            "/admin/projects/" + BAD,
            "/admin/allocations/" + BAD,
            "/admin/invitations/" + BAD,
            "/admin/skills/" + BAD,
            "/admin/skills/" + BAD + "/edit",
            "/admin/skills/" + BAD + "/department-links",
            "/admin/skill-categories/" + BAD,
            "/admin/skill-categories/" + BAD + "/edit",
            "/admin/audit-logs/" + BAD);
    }

    /** Every admin POST route that takes an id. */
    static Stream<String> actionRoutes() {
        return Stream.of(
            "/admin/users/" + BAD + "/edit",
            "/admin/users/" + BAD + "/activate",
            "/admin/users/" + BAD + "/suspend",
            "/admin/users/" + BAD + "/unlock",
            "/admin/users/" + BAD + "/roles/grant",
            "/admin/users/" + BAD + "/roles/revoke",
            "/admin/organizations/" + BAD + "/edit",
            "/admin/departments/" + BAD + "/edit",
            "/admin/departments/" + BAD + "/delete",
            "/admin/invitations/" + BAD + "/revoke",
            "/admin/invitations/" + BAD + "/regenerate",
            "/admin/skills/" + BAD + "/edit",
            "/admin/skills/" + BAD + "/deactivate",
            "/admin/skills/" + BAD + "/reactivate",
            "/admin/skills/" + BAD + "/department-links",
            "/admin/skills/" + UUID.randomUUID() + "/department-links/" + BAD + "/remove",
            "/admin/skill-categories/" + BAD + "/edit");
    }

    // ------------------------------------------------------ Malformed ids

    @ParameterizedTest
    @MethodSource("detailRoutes")
    void aMalformedIdRendersTheAdminNotFoundPage(String route) throws Exception {
        String html = mockMvc.perform(authorized(get(route)))
            .andExpect(status().isNotFound())
            .andReturn().getResponse().getContentAsString();

        assertThat(html).doesNotContain("MethodArgumentTypeMismatchException", "Exception",
            "java.util.UUID");
    }

    @ParameterizedTest
    @MethodSource("actionRoutes")
    void aMalformedIdOnAnActionRendersTheAdminNotFoundPage(String route) throws Exception {
        mockMvc.perform(authorized(post(route)).with(csrf()))
            .andExpect(status().isNotFound());
    }

    /** Other shapes of unusable id must behave the same as an obvious one. */
    @ParameterizedTest
    @ValueSource(strings = {"123", "null", "undefined", "NaN",
        "00000000-0000-0000-0000-00000000000", "0-0-0-0-0"})
    void otherUnusableIdShapesAlsoRenderNotFound(String id) throws Exception {
        mockMvc.perform(authorized(get("/admin/users/" + id)))
            .andExpect(status().isNotFound());
    }

    /**
     * Some shapes never reach MVC at all: Spring Security's {@code StrictHttpFirewall}
     * refuses an encoded space, a semicolon (matrix-parameter smuggling) and path
     * traversal with a 400 before routing. Those controls work as intended and are
     * left alone — what matters here is that none of them becomes a 500 either.
     */
    @ParameterizedTest
    @ValueSource(strings = {"%20", "1;drop table users", "../../etc/passwd", "..%2F..%2Fetc"})
    void firewallRejectedIdShapesAreRefusedBeforeRouting(String id) throws Exception {
        mockMvc.perform(authorized(get("/admin/users/" + id)))
            .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------ Security comes first

    @ParameterizedTest
    @MethodSource("detailRoutes")
    void anonymousIsRedirectedAndLearnsNothingFromAMalformedId(String route) throws Exception {
        String body = mockMvc.perform(get(route))
            .andExpect(status().is3xxRedirection())
            .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("MethodArgumentTypeMismatchException", "UUID");
    }

    /** CSRF is still enforced ahead of any id parsing. */
    @ParameterizedTest
    @MethodSource("actionRoutes")
    void aMalformedIdOnAnActionStillRequiresCsrf(String route) throws Exception {
        mockMvc.perform(authorized(post(route))).andExpect(status().isForbidden());
    }

    @Test
    void nonSystemAdminStillCannotAuthenticateIntoTheConsole() throws Exception {
        String email = uniqueEmail("pathvar");
        registerAdmin(uniqueName("PathVarOrg"), email, "Password123!");

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    // ------------------------------------------------- Existing behaviour

    @Test
    void aWellFormedButUnknownIdStillRendersTheSameNotFound() throws Exception {
        UUID unknown = UUID.randomUUID();

        mockMvc.perform(authorized(get("/admin/users/" + unknown)))
            .andExpect(status().isNotFound());
        mockMvc.perform(authorized(get("/admin/audit-logs/" + unknown)))
            .andExpect(status().isNotFound());
        mockMvc.perform(authorized(get("/admin/projects/" + unknown)))
            .andExpect(status().isNotFound());
    }

    @Test
    void validIdsStillRenderTheirPages() throws Exception {
        var admin = registerAdmin(uniqueName("PathVarValid"), uniqueEmail("pathvarvalid"),
            "Password123!");
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());

        mockMvc.perform(authorized(get("/admin/organizations/" + organizationId)))
            .andExpect(status().isOk());
    }
}
