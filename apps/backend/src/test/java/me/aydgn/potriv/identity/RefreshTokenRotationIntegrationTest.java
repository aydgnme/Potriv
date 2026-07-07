package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.RefreshToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserSession;
import me.aydgn.potriv.identity.repository.RefreshTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserSessionRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

class RefreshTokenRotationIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserSessionRepository userSessionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void loginCreatesSessionAndReturnsRawRefreshTokenStoredOnlyAsHash() throws Exception {
        String email = uniqueEmail("refresh");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        JsonNode login = login(email, "Password123!");
        String rawRefreshToken = login.get("refreshToken").asText();

        assertThat(rawRefreshToken).isNotBlank();

        UUID sessionId = UUID.fromString(decodeSid(login.get("accessToken").asText()));
        assertThat(userSessionRepository.findById(sessionId)).isPresent();

        // The raw token value must never be stored; only its SHA-256 hash.
        assertThat(refreshTokenRepository.findByTokenHash(rawRefreshToken)).isEmpty();
        assertThat(refreshTokenRepository.findByTokenHash(
            TokenDigest.sha256Base64Url(rawRefreshToken))).isPresent();
    }

    @Test
    void validRefreshRotatesTokenAndLinksReplacement() throws Exception {
        String email = uniqueEmail("refresh");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        JsonNode login = login(email, "Password123!");
        String oldRawToken = login.get("refreshToken").asText();

        JsonNode refreshed = refresh(oldRawToken);
        String newAccessToken = refreshed.get("accessToken").asText();
        String newRawToken = refreshed.get("refreshToken").asText();

        assertThat(newAccessToken).isNotBlank();
        assertThat(newRawToken).isNotBlank().isNotEqualTo(oldRawToken);

        RefreshToken oldToken = refreshTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(oldRawToken)).orElseThrow();
        RefreshToken newToken = refreshTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(newRawToken)).orElseThrow();

        assertThat(oldToken.isUsed()).isTrue();
        assertThat(oldToken.getReplacedByTokenId()).isEqualTo(newToken.getId());
        assertThat(newToken.isUsed()).isFalse();
    }

    @Test
    void oldRefreshTokenCannotRefreshNormally() throws Exception {
        String email = uniqueEmail("refresh");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        String oldRawToken = login(email, "Password123!").get("refreshToken").asText();
        refresh(oldRawToken);

        expectRefreshUnauthorized(oldRawToken);
    }

    @Test
    void reuseOfRotatedTokenRevokesEntireSession() throws Exception {
        String email = uniqueEmail("refresh");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        JsonNode login = login(email, "Password123!");
        String oldRawToken = login.get("refreshToken").asText();
        UUID sessionId = UUID.fromString(decodeSid(login.get("accessToken").asText()));

        JsonNode refreshed = refresh(oldRawToken);
        String newRawToken = refreshed.get("refreshToken").asText();

        // Replaying the already-used token is treated as reuse.
        expectRefreshUnauthorized(oldRawToken);

        UserSession session = userSessionRepository.findById(sessionId).orElseThrow();
        assertThat(session.isRevoked()).isTrue();

        // The newly issued token belongs to the now-revoked session and fails too.
        expectRefreshUnauthorized(newRawToken);
    }

    @Test
    void expiredRefreshTokenReturns401() throws Exception {
        User user = platformlessUser();
        UserSession session = userSessionRepository.save(new UserSession(user, "agent", "ip"));

        String rawToken = "expired-" + UUID.randomUUID();
        refreshTokenRepository.save(new RefreshToken(
            session,
            TokenDigest.sha256Base64Url(rawToken),
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(1)
        ));

        expectRefreshUnauthorized(rawToken);
    }

    @Test
    void revokedRefreshTokenReturns401() throws Exception {
        User user = platformlessUser();
        UserSession session = userSessionRepository.save(new UserSession(user, "agent", "ip"));

        String rawToken = "revoked-" + UUID.randomUUID();
        RefreshToken token = new RefreshToken(
            session,
            TokenDigest.sha256Base64Url(rawToken),
            OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)
        );
        token.revoke();
        refreshTokenRepository.save(token);

        expectRefreshUnauthorized(rawToken);
    }

    @Test
    void refreshForRevokedSessionReturns401() throws Exception {
        User user = platformlessUser();
        UserSession session = new UserSession(user, "agent", "ip");
        session.revoke();
        userSessionRepository.save(session);

        String rawToken = "revoked-session-" + UUID.randomUUID();
        refreshTokenRepository.save(new RefreshToken(
            session,
            TokenDigest.sha256Base64Url(rawToken),
            OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)
        ));

        expectRefreshUnauthorized(rawToken);
    }

    @Test
    void unknownRefreshTokenReturns401() throws Exception {
        expectRefreshUnauthorized("this-token-was-never-issued");
    }

    private void expectRefreshUnauthorized(String rawToken) throws Exception {
        mockMvc.perform(post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", rawToken))))
            .andExpect(status().isUnauthorized());
    }

    private User platformlessUser() {
        Organization organization = organizationRepository.save(
            new Organization(uniqueName("Org"), "Addr"));
        return userRepository.save(new User(
            organization,
            "Refresh User",
            uniqueEmail("refresh"),
            passwordEncoder.encode("Password123!")
        ));
    }

    private String decodeSid(String accessToken) throws Exception {
        String payload = accessToken.split("\\.")[1];
        return objectMapper.readTree(java.util.Base64.getUrlDecoder().decode(payload))
            .get("sid").asText();
    }
}
