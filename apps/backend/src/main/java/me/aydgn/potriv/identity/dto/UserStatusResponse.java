package me.aydgn.potriv.identity.dto;

import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;

public record UserStatusResponse(
    UUID userId,
    AccessAccountStatus status
) {

}
