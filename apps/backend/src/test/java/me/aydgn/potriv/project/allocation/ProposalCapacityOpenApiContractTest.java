package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * The capacity context is an additive response field, so it has to appear in the
 * published contract — otherwise a generated client would never see it and the
 * frontend would be reading a field the API does not admit exists.
 *
 * <p>Pinned here rather than checked by hand once, because springdoc derives the
 * schema from the record: renaming or dropping a component silently changes the
 * contract, and this fails when that happens.
 */
class ProposalCapacityOpenApiContractTest extends AbstractMockMvcIntegrationTest {

    @Test
    void reviewQueueSchemaPublishesTheCapacityContext() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode schemas = objectMapper.readTree(body).get("components").get("schemas");

        JsonNode reviewRow = schemas.get("DepartmentProjectProposalResponse");
        assertThat(reviewRow).as("the review-queue response schema").isNotNull();
        assertThat(reviewRow.get("properties").has("capacity"))
            .as("the review row must publish its capacity context")
            .isTrue();

        JsonNode capacity = schemas.get("ProposalCapacityContext");
        assertThat(capacity).as("the capacity context schema").isNotNull();
        assertThat(capacity.get("properties").fieldNames())
            .toIterable()
            .contains(
                "maxHoursPerDay",
                "allocatedHoursPerDay",
                "availableHoursPerDay",
                "requestedHoursPerDay",
                "projectedAllocatedHoursPerDay",
                "projectedAvailableHoursPerDay",
                "currentlyAcceptableByCapacity");
    }
}
