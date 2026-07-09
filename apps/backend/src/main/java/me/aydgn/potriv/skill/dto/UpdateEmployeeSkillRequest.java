package me.aydgn.potriv.skill.dto;

import me.aydgn.potriv.skill.entity.SkillExperience;
import me.aydgn.potriv.skill.entity.SkillLevel;

/**
 * Partial update. A {@code null} field means "leave unchanged". The skill and
 * user are immutable; level and experience never become null.
 */
public record UpdateEmployeeSkillRequest(
    SkillLevel level,
    SkillExperience experience
) {

}
