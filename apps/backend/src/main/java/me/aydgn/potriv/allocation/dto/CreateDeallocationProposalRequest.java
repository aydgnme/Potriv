package me.aydgn.potriv.allocation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateDeallocationProposalRequest(
    @NotBlank
    @Size(max = 5000)
    String reason
) {

}
