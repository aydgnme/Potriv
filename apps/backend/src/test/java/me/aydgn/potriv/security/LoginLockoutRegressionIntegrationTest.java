package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;

class LoginLockoutRegressionIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void fewFailedAttemptsDoNotLockButThresholdDoes() throws Exception {
        String email = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        for (int i = 1; i <= 4; i++) {
            failLogin(email);
        }
        User afterFour = userRepository.findByEmail(email).orElseThrow();
        assertThat(afterFour.getFailedLoginAttempts()).isEqualTo(4);
        assertThat(afterFour.isLoginLocked()).isFalse();

        // The 5th consecutive failure triggers the lock, persisted in PostgreSQL.
        failLogin(email);
        User afterFive = userRepository.findByEmail(email).orElseThrow();
        assertThat(afterFive.getLockedUntil()).isNotNull();
        assertThat(afterFive.isLoginLocked()).isTrue();
    }

    @Test
    void correctPasswordDuringLockoutFails() throws Exception {
        String email = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        for (int i = 0; i < 5; i++) {
            failLogin(email);
        }

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "Password123!"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void lockExpiresAndCorrectPasswordThenLogsIn() throws Exception {
        String email = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        for (int i = 0; i < 5; i++) {
            failLogin(email);
        }

        // Age the persisted lock into the past (no injectable Clock in the impl).
        jdbcTemplate.update(
            "update users set locked_until = ? where email = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1), email);

        login(email, "Password123!");
    }

    @Test
    void successfulLoginResetsFailures() throws Exception {
        String email = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        failLogin(email);
        failLogin(email);
        assertThat(userRepository.findByEmail(email).orElseThrow().getFailedLoginAttempts())
            .isEqualTo(2);

        login(email, "Password123!");

        User user = userRepository.findByEmail(email).orElseThrow();
        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }

    @Test
    void publicResponseDoesNotEnumerateAccountExistence() throws Exception {
        String existingEmail = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), existingEmail, "Password123!");

        String wrongPasswordMessage = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", existingEmail, "password", "WrongPassword1!"))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        String unknownEmailMessage = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", uniqueEmail("ghost"), "password", "WrongPassword1!"))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        assertThat(objectMapper.readTree(wrongPasswordMessage).get("message").asText())
            .isEqualTo(objectMapper.readTree(unknownEmailMessage).get("message").asText());
    }

    @Test
    void concurrentFailureUpdatesDoNotLoseAttempts() throws Exception {
        String email = uniqueEmail("lock");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        int concurrentAttempts = 4;
        ExecutorService executor = Executors.newFixedThreadPool(concurrentAttempts);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(concurrentAttempts);

        for (int i = 0; i < concurrentAttempts; i++) {
            executor.submit(() -> {
                try {
                    startGate.await();
                    failLogin(email);
                } catch (Exception ignored) {
                    // Assertion happens after the latch resolves.
                } finally {
                    done.countDown();
                }
            });
        }

        startGate.countDown();
        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        executor.shutdown();

        // The pessimistic row lock serializes the updates, so all four count.
        assertThat(userRepository.findByEmail(email).orElseThrow().getFailedLoginAttempts())
            .isEqualTo(concurrentAttempts);
    }

    private void failLogin(String email) throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "WrongPassword1!"))))
            .andExpect(status().isBadRequest());
    }
}
