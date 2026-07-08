package me.aydgn.potriv.organization.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record AssignDepartmentManagerRequest(
    @NotNull UUID userId
) {

}
