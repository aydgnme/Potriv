package me.aydgn.potriv.identity.dto;

import java.util.Set;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import me.aydgn.potriv.identity.entity.AccessRole;

public record UpdateUserRolesRequest(
    @NotNull
    @Size(min = 1)
    Set<AccessRole> roles
) {

}
