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
import me.aydgn.potriv.skill.dto.CreateSkillRequest;
import me.aydgn.potriv.skill.dto.SkillResponse;
import me.aydgn.potriv.skill.dto.UpdateSkillRequest;
import me.aydgn.potriv.skill.service.SkillService;

@RestController
@RequestMapping("/skills")
@Tag(
    name = "Skills",
    description = "Organization skill catalog. Department Managers author skills; "
        + "only the author may update or delete a skill. All organization users may read."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class SkillController {

    private final SkillService skillService;

    public SkillController(SkillService skillService) {
        this.skillService = skillService;
    }

    @PostMapping
    @DepartmentManagerOnly
    @ResponseStatus(HttpStatus.CREATED)
    public SkillResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateSkillRequest request
    ) {
        return skillService.create(authenticatedUser, request);
    }

    @GetMapping
    public List<SkillResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive,
        @RequestParam(name = "categoryId", required = false) UUID categoryId,
        @RequestParam(name = "q", required = false) String q
    ) {
        return skillService.list(authenticatedUser, includeInactive, categoryId, q);
    }

    @GetMapping("/{skillId}")
    public SkillResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId
    ) {
        return skillService.get(authenticatedUser, skillId);
    }

    @PatchMapping("/{skillId}")
    @DepartmentManagerOnly
    public SkillResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId,
        @Valid @RequestBody UpdateSkillRequest request
    ) {
        return skillService.update(authenticatedUser, skillId, request);
    }

    @DeleteMapping("/{skillId}")
    @DepartmentManagerOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID skillId
    ) {
        skillService.deactivate(authenticatedUser, skillId);
    }
}
