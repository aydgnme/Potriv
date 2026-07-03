package me.aydgn.potriv.identity.dto;

import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

public record CurrentUserResponse(
    UUID userId,
    UUID organizationId,
    String email,
    List<AccessRole> roles
) {

}
