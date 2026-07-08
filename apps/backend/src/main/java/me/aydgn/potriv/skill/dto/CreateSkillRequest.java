package me.aydgn.potriv.skill.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateSkillRequest(
    @NotNull UUID categoryId,

    @NotBlank
    @Size(max = 160)
    String name,

    @Size(max = 4000)
    String description
) {

}
