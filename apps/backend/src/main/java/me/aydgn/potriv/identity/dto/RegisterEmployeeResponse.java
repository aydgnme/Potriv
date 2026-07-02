package me.aydgn.potriv.identity.dto;

import java.util.UUID;

public record RegisterEmployeeResponse(
    UUID organizationId,
    UUID userId
) {

}
