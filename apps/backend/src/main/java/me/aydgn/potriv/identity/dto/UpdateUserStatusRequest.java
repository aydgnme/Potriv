package me.aydgn.potriv.identity.dto;

import jakarta.validation.constraints.NotNull;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;

public record UpdateUserStatusRequest(
    @NotNull AccessAccountStatus status
) {

}
