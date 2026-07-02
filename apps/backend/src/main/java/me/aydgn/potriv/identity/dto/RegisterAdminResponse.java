package me.aydgn.potriv.identity.dto;

import java.util.UUID;

public record RegisterAdminResponse(
    UUID organizationId,
    UUID userId,
    String employeeInviteUrl
) {

}
