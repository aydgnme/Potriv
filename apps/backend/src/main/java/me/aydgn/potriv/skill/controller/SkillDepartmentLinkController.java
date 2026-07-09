package me.aydgn.potriv.skill.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;
import me.aydgn.potriv.skill.dto.SkillDepartmentRef;
import me.aydgn.potriv.skill.service.SkillDepartmentLinkService;

@RestController
@RequestMapping("/skills/{skillId}/departments")
@Tag(
    name = "Skills",
    description = "Skill-to-department links. A manager links a skill to the one department "
        + "they are assigned to manage; the department is resolved from the principal."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class SkillDepartmentLinkController {

    private final SkillDepartmentLinkService linkService;

    public SkillDepartmentLinkController(SkillDepartmentLinkService linkService) {
        this.linkService = linkService;
    }

    @GetMapping
    public List<SkillDepartmentRef> listDepartments(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId
    ) {
        return linkService.listDepartments(authenticatedUser, skillId);
    }

    @PostMapping("/current")
    @DepartmentManagerOnly
    public List<SkillDepartmentRef> linkCurrentDepartment(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId
    ) {
        return linkService.linkCurrentDepartment(authenticatedUser, skillId);
    }

    @DeleteMapping("/current")
    @DepartmentManagerOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlinkCurrentDepartment(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId
    ) {
        linkService.unlinkCurrentDepartment(authenticatedUser, skillId);
    }
}
