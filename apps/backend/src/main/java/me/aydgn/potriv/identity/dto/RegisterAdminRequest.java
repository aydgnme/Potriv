package me.aydgn.potriv.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterAdminRequest(
    @NotBlank
    @Size(max = 120)
    String name,

    @NotBlank
    @Email
    @Size(max = 180)
    String email,

    @NotBlank
    @Size(min = 8, max = 72)
    String password,

    @NotBlank
    @Size(max = 160)
    String organizationName,

    @NotBlank
    @Size(max = 1000)
    String headquarterAddress
) {
}
