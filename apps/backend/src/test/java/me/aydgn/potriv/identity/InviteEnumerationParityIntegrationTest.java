package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * What an administrator can learn about people who are not in their
 * organization.
 *
 * Inviting an address that already had an account answered 400 with "This
 * address already has an account."; inviting an unknown one answered 201. That
 * turned an ordinary organization-admin endpoint into a global account oracle:
 * an administrator of any tenant could test whether any address had a Potriv
 * account at all, one at a time, and the answer was authoritative and free.
 *
 * The three cases are now indistinguishable from outside — status, body shape,
 * what the admin list shows afterwards, and whether mail was sent. An address
 * that already has an account fails at redemption instead, with the same
 * generic error every other dead invitation produces.
 */
class InviteEnumerationParityIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

    @Test
    @DisplayName("inviting a stranger, a colleague and an unknown address look identical")
    void invitingIsIndistinguishableWhateverTheAddressAlreadyIs() throws Exception {
        // Another organization entirely, with one registered employee.
        String otherAdminEmail = uniqueEmail("other-admin");
        registerAdmin(uniqueName("Other Org"), otherAdminEmail, PASSWORD);
        String otherAdminToken = loginForAccessToken(otherAdminEmail, PASSWORD);
        String foreignEmployee = uniqueEmail("foreign");
        inviteAndRegisterEmployee(otherAdminToken, foreignEmployee, PASSWORD);

        // The organization doing the inviting, with one registered employee.
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);
        String ownEmployee = uniqueEmail("own");
        inviteAndRegisterEmployee(adminToken, ownEmployee, PASSWORD);

        String stranger = uniqueEmail("stranger");

        int mailBefore = recordingMailSender.getSentMessages().size();

        String foreignResponse = invite(adminToken, foreignEmployee);
        String ownResponse = invite(adminToken, ownEmployee);
        String strangerResponse = invite(adminToken, stranger);

        // Same shape: the same field names, in the same order, all populated.
        assertThat(shapeOf(foreignResponse))
            .isEqualTo(shapeOf(ownResponse))
            .isEqualTo(shapeOf(strangerResponse));

        // And nothing in any of them names the difference.
        for (String body : List.of(foreignResponse, ownResponse, strangerResponse)) {
            assertThat(body.toLowerCase(java.util.Locale.ROOT))
                .doesNotContain("already", "exists", "registered", "account");
        }

        // Delivery state is identical too: one message per invitation, so a
        // caller cannot infer the answer from whether mail went out.
        assertThat(recordingMailSender.getSentMessages()).hasSize(mailBefore + 3);

        // Nor from what the administrator's own list shows afterwards.
        JsonNode listed = objectMapper.readTree(mockMvc.perform(get(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());

        List<String> pending = new java.util.ArrayList<>();
        listed.forEach(entry -> {
            if ("PENDING".equals(entry.get("status").asText())) {
                pending.add(entry.get("maskedEmail").asText());
            }
        });
        assertThat(pending).hasSize(3);
    }

    @Test
    @DisplayName("an address that already has an account fails where every dead invite does")
    void theRefusalHappensAtRedemptionAndSaysNothingExtra() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String taken = uniqueEmail("taken");
        inviteAndRegisterEmployee(adminToken, taken, PASSWORD);

        // Invited again — accepted, as any address is.
        inviteEmployee(adminToken, taken);
        String rawToken = inviteTokenFromMailTo(taken);

        String body = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Duplicate",
                    "email", taken,
                    "password", PASSWORD))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        JsonNode error = objectMapper.readTree(body);
        assertThat(error.get("code").asText()).isEqualTo("INVITE_INVALID");
        assertThat(body.toLowerCase(java.util.Locale.ROOT))
            .doesNotContain("already", "exists", "registered", "account");
    }

    // ---- helpers ----

    private String invite(String adminToken, String email) throws Exception {
        String body = mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted())
            .andReturn().getResponse().getContentAsString();

        // Queued, not sent. Delivery is the worker's job, and it has to run for
        // "was mail sent" to mean anything in the assertions above.
        inviteDeliveryWorker.runOnce();
        return body;
    }

    /** Field names and which of them are populated — the part a probe can read. */
    private String shapeOf(String body) throws Exception {
        JsonNode node = objectMapper.readTree(body);
        StringBuilder shape = new StringBuilder();
        node.fieldNames().forEachRemaining(name ->
            shape.append(name).append('=').append(node.get(name).isNull() ? "null" : "set")
                .append(';'));
        return shape.toString();
    }
}
