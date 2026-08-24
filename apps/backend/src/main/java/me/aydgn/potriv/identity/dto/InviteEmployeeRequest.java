package me.aydgn.potriv.identity.dto;

import me.aydgn.potriv.identity.support.EmailAddresses;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The address an invite is issued to. */
public record InviteEmployeeRequest(
    @NotBlank @Email @Size(max = EmailAddresses.MAX_LENGTH) String email
) {
}
