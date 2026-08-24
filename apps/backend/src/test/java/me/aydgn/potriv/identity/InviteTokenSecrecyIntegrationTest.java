package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.repository.UserRepository;

/**
 * What must remain true of an invitation's raw token.
 *
 * The token used to be a plaintext column with no expiry and no owner: anybody
 * who could read the table — a backup, a query in a support console, a dump in
 * a ticket — could mint accounts into any organization, forever. These tests
 * are the standing proof that it is not that any more.
 *
 * The three properties, one test each:
 *
 * <ol>
 *   <li>the token exists nowhere it could be read later — not in the database,
 *       not in an API response, not in an audit record;</li>
 *   <li>it redeems exactly once, even when several requests race for it;</li>
 *   <li>it redeems only for the person it was addressed to.</li>
 * </ol>
 */
class InviteTokenSecrecyIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    // ---- 1. the token is not retained anywhere ----

    @Test
    @DisplayName("no column of any table holds the raw token")
    void theRawTokenIsNeverWrittenToTheDatabase() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String rawToken = inviteTokenFromMailTo(employeeEmail);

        /*
          Every text-ish column in the schema, not just the ones this feature is
          known to touch. A leak that mattered would be one nobody thought to
          look for — an audit detail, a log table, a denormalised copy — so the
          search is exhaustive rather than targeted.
        */
        List<Map<String, Object>> columns = jdbcTemplate.queryForList("""
            select table_name, column_name
              from information_schema.columns
             where table_schema = 'public'
               and data_type in ('character varying', 'text', 'character')
            """);
        assertThat(columns).isNotEmpty();

        List<String> holders = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            String table = String.valueOf(column.get("table_name"));
            String field = String.valueOf(column.get("column_name"));
            Integer hits = jdbcTemplate.queryForObject(
                "select count(*) from \"%s\" where \"%s\" like ?".formatted(table, field),
                Integer.class, "%" + rawToken + "%");
            if (hits != null && hits > 0) holders.add(table + "." + field);
        }

        assertThat(holders)
            .as("the raw invite token must not be readable from the database")
            .isEmpty();

        // The hash, on the other hand, is exactly where it should be.
        Integer hashed = jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens where token_hash = ?",
            Integer.class, TokenDigest.sha256Base64Url(rawToken));
        assertThat(hashed).isEqualTo(1);
    }

    @Test
    @DisplayName("no administrator-facing response carries the token")
    void theInviteApiNeverReturnsTheToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        String created = mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", employeeEmail))))
            .andExpect(status().isAccepted())
            .andReturn().getResponse().getContentAsString();

        // Queued, not sent. Delivery is the worker's job.
        inviteDeliveryWorker.runOnce();

        String listed = mockMvc.perform(get(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String rawToken = inviteTokenFromMailTo(employeeEmail);

        for (String body : List.of(created, listed)) {
            assertThat(body).doesNotContain(rawToken);
            assertThat(body).doesNotContain("token=");
            // A 43-character base64url run is what this token looks like; the
            // check catches a leak through a field renamed to something
            // innocuous as well as one through a field called "token".
            assertThat(body).doesNotMatch(".*[A-Za-z0-9_-]{43}.*");
        }

        // Nor is the full address handed back to be scraped.
        assertThat(created).doesNotContain(employeeEmail);
        assertThat(listed).doesNotContain(employeeEmail);
    }

    // ---- 2. it redeems exactly once ----

    @Test
    @DisplayName("only one of several simultaneous redemptions creates an account")
    void concurrentRedemptionsOfOneInviteProduceExactlyOneAccount() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String rawToken = inviteTokenFromMailTo(employeeEmail);

        /*
          A check-then-act would pass a single-threaded test and fail here: every
          thread would read the invite as usable before any of them consumed it.
          Redemption is therefore a single conditional UPDATE, and the database
          decides the winner. Eight threads released together is enough to make
          that difference show.
        */
        int racers = 8;
        CyclicBarrier startTogether = new CyclicBarrier(racers);
        ExecutorService pool = Executors.newFixedThreadPool(racers);

        List<Callable<Integer>> attempts = new ArrayList<>();
        for (int i = 0; i < racers; i++) {
            attempts.add(() -> {
                startTogether.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/auth/register-employee")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                            "token", rawToken,
                            "name", "Racer",
                            "email", employeeEmail,
                            "password", PASSWORD))))
                    .andReturn().getResponse().getStatus();
            });
        }

        List<Integer> statuses = new ArrayList<>();
        try {
            for (Future<Integer> outcome : pool.invokeAll(attempts, 60, TimeUnit.SECONDS)) {
                statuses.add(outcome.get());
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(1);
        assertThat(statuses).filteredOn(status -> status != 201).allMatch(status -> status == 400);

        // The decisive assertion: one account, not one *response*.
        Integer accounts = jdbcTemplate.queryForObject(
            "select count(*) from users where email = ?", Integer.class, employeeEmail);
        assertThat(accounts).isEqualTo(1);

        // And the invite is spent, not merely flagged.
        Integer redeemable = jdbcTemplate.queryForObject("""
            select count(*) from invite_tokens
             where token_hash = ? and active and consumed_at is null
            """, Integer.class, TokenDigest.sha256Base64Url(rawToken));
        assertThat(redeemable).isZero();
    }

    // ---- 3. it redeems only for its recipient ----

    @Test
    @DisplayName("a live invite is useless to anybody but the person it names")
    void anInviteCannotBeRedeemedByAnotherAddress() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String intendedEmail = uniqueEmail("intended");
        inviteEmployee(adminToken, intendedEmail);
        String rawToken = inviteTokenFromMailTo(intendedEmail);

        String interloperEmail = uniqueEmail("interloper");
        mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Interloper",
                    "email", interloperEmail,
                    "password", PASSWORD))))
            .andExpect(status().isBadRequest());

        assertThat(userRepository.findByEmail(interloperEmail)).isEmpty();

        // The failed attempt did not spend the invitation either — the person it
        // was for can still use it.
        registerEmployee(rawToken, intendedEmail, PASSWORD);
        assertThat(userRepository.findByEmail(intendedEmail)).isPresent();
    }

    @Test
    @DisplayName("the address is matched after normalisation, not before")
    void redemptionMatchesTheAddressTheSameWayItWasStored() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        /*
          If the two sides normalised differently, an invitation issued to
          `Sam@…` would be unredeemable by Sam — or, worse, redeemable twice by
          spelling it two ways. One helper does it on both paths; this is the
          test that would fail if that ever stopped being true.
        */
        String mixedCase = "Invitee-" + java.util.UUID.randomUUID() + "@Potriv.TEST";
        inviteEmployee(adminToken, mixedCase);
        String rawToken = inviteTokenFromMailTo(mixedCase);

        // Spelled differently from how it was invited, and still the same person.
        registerEmployee(rawToken, mixedCase.toUpperCase(java.util.Locale.ROOT), PASSWORD);

        assertThat(userRepository.findByEmail(
            mixedCase.toLowerCase(java.util.Locale.ROOT))).isPresent();
    }
}
