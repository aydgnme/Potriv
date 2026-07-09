package me.aydgn.potriv.skill.dto;

import java.util.UUID;

public record SkillCategoryRef(
    UUID categoryId,
    String name
) {

}
