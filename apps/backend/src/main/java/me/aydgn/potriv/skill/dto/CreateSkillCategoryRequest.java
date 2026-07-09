package me.aydgn.potriv.skill.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSkillCategoryRequest(
    @NotBlank
    @Size(max = 120)
    String name
) {

}
