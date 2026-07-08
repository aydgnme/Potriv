package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

class DepartmentCrudIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Test
    void orgAdminCreatesDepartmentWithUuidIdManagerNullAndZeroMembers() throws Exception {
        String token = orgAdminToken();

        String response = createDepartment(token, "Engineering")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Engineering"))
            .andExpect(jsonPath("$.manager").doesNotExist())
            .andExpect(jsonPath("$.memberCount").value(0))
            .andReturn().getResponse().getContentAsString();

        JsonNode body = objectMapper.readTree(response);
        assertThat(UUID.fromString(body.get("departmentId").asText())).isNotNull();
        assertThat(body.has("normalizedName")).isFalse();
    }

    @Test
    void caseInsensitiveSameOrgDuplicateIsRejected() throws Exception {
        String token = orgAdminToken();
        createDepartment(token, "Marketing").andExpect(status().isCreated());
        createDepartment(token, "  marketing ").andExpect(status().isConflict());
    }

    @Test
    void sameNameInAnotherOrganizationIsAllowed() throws Exception {
        createDepartment(orgAdminToken(), "Finance").andExpect(status().isCreated());
        createDepartment(orgAdminToken(), "Finance").andExpect(status().isCreated());
    }

    @Test
    void listIsTenantScopedAndNameAscending() throws Exception {
        String token = orgAdminToken();
        createDepartment(token, "Zeta").andExpect(status().isCreated());
        createDepartment(token, "Alpha").andExpect(status().isCreated());
        createDepartment(token, "Mu").andExpect(status().isCreated());

        String response = mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode array = objectMapper.readTree(response);
        List<String> names = new java.util.ArrayList<>();
        array.forEach(node -> names.add(node.get("name").asText()));
        assertThat(names).containsExactly("Alpha", "Mu", "Zeta");
    }

    @Test
    void detailIsTenantScopedAndCrossOrgReturns404() throws Exception {
        String tokenA = orgAdminToken();
        UUID id = createdId(createDepartment(tokenA, "Support"));

        mockMvc.perform(get("/departments/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(tokenA)))
            .andExpect(status().isOk());

        mockMvc.perform(get("/departments/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(orgAdminToken())))
            .andExpect(status().isNotFound());
    }

    @Test
    void patchUpdatesName() throws Exception {
        String token = orgAdminToken();
        UUID id = createdId(createDepartment(token, "Ops"));

        mockMvc.perform(patch("/departments/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Operations"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Operations"));
    }

    @Test
    void emptyDepartmentDeletesAndIsThenAbsent() throws Exception {
        String token = orgAdminToken();
        UUID id = createdId(createDepartment(token, "Temporary"));

        mockMvc.perform(delete("/departments/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/departments/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNotFound());
    }

    @Test
    void employeeReceives403() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String employeeEmail = uniqueEmail("employee");
        registerEmployee(extractInviteToken(admin.get("employeeInviteUrl").asText()),
            employeeEmail, "Password123!");
        String employeeToken = loginForAccessToken(employeeEmail, "Password123!");

        mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    void platformSystemAdminWithoutOrganizationReceivesControlledError() throws Exception {
        mockMvc.perform(get("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isBadRequest());
    }

    private ResultActions createDepartment(String token, String name) throws Exception {
        return mockMvc.perform(post("/departments")
            .header(HttpHeaders.AUTHORIZATION, bearer(token))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    private UUID createdId(ResultActions creation) throws Exception {
        String body = creation.andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("departmentId").asText());
    }

    private String orgAdminToken() throws Exception {
        String email = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), email, "Password123!");
        return loginForAccessToken(email, "Password123!");
    }
}
