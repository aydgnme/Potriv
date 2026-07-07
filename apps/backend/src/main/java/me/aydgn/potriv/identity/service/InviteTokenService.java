package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.organization.entity.Organization;

@Service
public class InviteTokenService {

    private static final int TOKEN_BYTE_LENGTH = 32;

    private final InviteTokenRepository inviteTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String frontendUrl;

    public InviteTokenService(
        InviteTokenRepository inviteTokenRepository,
        @Value("${app.frontend-url}") String frontendUrl
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.frontendUrl = frontendUrl;
    }

    public InviteToken createForOrganization(Organization organization) {
        return inviteTokenRepository.save(
            new InviteToken(organization, generateToken(), null)
        );
    }

    public String buildInviteUrl(InviteToken inviteToken) {
        return frontendUrl + "/invite?token=" + inviteToken.getToken();
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
