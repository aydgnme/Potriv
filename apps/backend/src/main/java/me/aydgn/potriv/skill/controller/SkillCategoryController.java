package me.aydgn.potriv.skill.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;
import me.aydgn.potriv.skill.dto.CreateSkillCategoryRequest;
import me.aydgn.potriv.skill.dto.SkillCategoryResponse;
import me.aydgn.potriv.skill.dto.UpdateSkillCategoryRequest;
import me.aydgn.potriv.skill.service.SkillCategoryService;

@RestController
@RequestMapping("/skill-categories")
@Tag(
    name = "Skill Categories",
    description = "Reusable organization catalog of skill categories. Managers configure them; "
        + "all organization users may read them."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class SkillCategoryController {

    private final SkillCategoryService skillCategoryService;

    public SkillCategoryController(SkillCategoryService skillCategoryService) {
        this.skillCategoryService = skillCategoryService;
    }

    @PostMapping
    @DepartmentManagerOnly
    @ResponseStatus(HttpStatus.CREATED)
    public SkillCategoryResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateSkillCategoryRequest request
    ) {
        return skillCategoryService.create(authenticatedUser, request);
    }

    @GetMapping
    public List<SkillCategoryResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive
    ) {
        return skillCategoryService.list(authenticatedUser, includeInactive);
    }

    @GetMapping("/{categoryId}")
    public SkillCategoryResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID categoryId
    ) {
        return skillCategoryService.get(authenticatedUser, categoryId);
    }

    @PatchMapping("/{categoryId}")
    @DepartmentManagerOnly
    public SkillCategoryResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID categoryId,
        @Valid @RequestBody UpdateSkillCategoryRequest request
    ) {
        return skillCategoryService.update(authenticatedUser, categoryId, request);
    }

    @DeleteMapping("/{categoryId}")
    @DepartmentManagerOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID categoryId
    ) {
        skillCategoryService.deactivate(authenticatedUser, categoryId);
    }
}
