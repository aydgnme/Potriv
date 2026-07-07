package me.aydgn.potriv.identity.dto;

import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

public record TokenPairResponse(
    String accessToken,
    String refreshToken,
    String tokenType,
    long expiresInSeconds,
    UUID userId,
    UUID organizationId,
    String name,
    String email,
    List<AccessRole> roles
) {

}
