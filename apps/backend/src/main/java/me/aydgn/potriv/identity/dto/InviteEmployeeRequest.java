package me.aydgn.potriv.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The address an invite is issued to. */
public record InviteEmployeeRequest(
    @NotBlank @Email @Size(max = 320) String email
) {
}
