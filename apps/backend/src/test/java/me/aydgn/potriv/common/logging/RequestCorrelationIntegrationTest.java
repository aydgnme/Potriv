package me.aydgn.potriv.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.MediaType;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * Request correlation: every request gets an id, the caller can see it, and a
 * hostile one cannot reach the logs.
 */
class RequestCorrelationIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String HEADER = RequestCorrelationFilter.HEADER;

    private String requestIdOf(String suppliedHeader) throws Exception {
        var request = get("/actuator/health");
        if (suppliedHeader != null) {
            request = request.header(HEADER, suppliedHeader);
        }
        return mockMvc.perform(request)
            .andExpect(header().exists(HEADER))
            .andReturn().getResponse().getHeader(HEADER);
    }

    @Test
    void everyResponseCarriesARequestId() throws Exception {
        assertThat(requestIdOf(null)).isNotBlank();
    }

    @Test
    void eachRequestGetsItsOwnId() throws Exception {
        assertThat(requestIdOf(null)).isNotEqualTo(requestIdOf(null));
    }

    @Test
    void aUsableCallerSuppliedIdIsKept() throws Exception {
        assertThat(requestIdOf("checkout-42_a.b")).isEqualTo("checkout-42_a.b");
    }

    /**
     * The header lands in log files, so an unusable value is replaced rather than
     * echoed — a CRLF or an unbounded string would otherwise be a log-injection
     * vector. Replacement, not rejection: a bad correlation header must never
     * fail the request.
     */
    @Test
    void hostileOrUnusableIdsAreReplacedButTheRequestStillSucceeds() throws Exception {
        String[] hostile = {
            "a".repeat(RequestCorrelationFilter.MAX_LENGTH + 1),
            "line\r\ninjected",
            "<script>alert(1)</script>",
            "space separated",
            "",
        };

        for (String supplied : hostile) {
            String returned = requestIdOf(supplied);
            assertThat(returned)
                .as("hostile id %s must not be echoed", supplied)
                .isNotEqualTo(supplied)
                .isNotBlank()
                .matches("[A-Za-z0-9._-]{1,64}");
        }
    }

    /** An unauthenticated rejection still needs a correlation id — that is when it matters. */
    @Test
    void rejectedRequestsAreStillCorrelated() throws Exception {
        mockMvc.perform(get("/users/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(header().exists(HEADER));
    }

    @Test
    void errorResponsesAreStillCorrelatedAndOtherwiseUnchanged() throws Exception {
        // A malformed body still produces the same 400 contract it always did.
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{not json"))
            .andExpect(status().isBadRequest())
            .andExpect(header().exists(HEADER));
    }

    /**
     * The filter runs on pooled container threads. If it ever failed to clean up,
     * one request's id would silently appear in another's logs.
     */
    @Test
    void theMdcIsCleanedUpAfterTheRequest() throws Exception {
        MDC.remove(RequestCorrelationFilter.MDC_KEY);

        mockMvc.perform(get("/actuator/health"));

        assertThat(MDC.get(RequestCorrelationFilter.MDC_KEY)).isNull();
    }
}
