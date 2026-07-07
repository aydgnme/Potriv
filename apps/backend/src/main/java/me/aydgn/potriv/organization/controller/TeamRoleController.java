package me.aydgn.potriv.organization.controller;

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
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.organization.dto.CreateTeamRoleRequest;
import me.aydgn.potriv.organization.dto.TeamRoleResponse;
import me.aydgn.potriv.organization.dto.UpdateTeamRoleRequest;
import me.aydgn.potriv.organization.service.TeamRoleService;

@RestController
@RequestMapping("/team-roles")
@OrganizationAdminOnly
@Tag(
    name = "Team Roles",
    description = "Organization-defined informational team roles. Distinct from access "
        + "roles: they never grant application permissions."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class TeamRoleController {

    private final TeamRoleService teamRoleService;

    public TeamRoleController(TeamRoleService teamRoleService) {
        this.teamRoleService = teamRoleService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeamRoleResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateTeamRoleRequest request
    ) {
        return teamRoleService.create(authenticatedUser, request);
    }

    @GetMapping
    public List<TeamRoleResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive
    ) {
        return teamRoleService.list(authenticatedUser, includeInactive);
    }

    @GetMapping("/{teamRoleId}")
    public TeamRoleResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId
    ) {
        return teamRoleService.get(authenticatedUser, teamRoleId);
    }

    @PatchMapping("/{teamRoleId}")
    public TeamRoleResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId,
        @Valid @RequestBody UpdateTeamRoleRequest request
    ) {
        return teamRoleService.update(authenticatedUser, teamRoleId, request);
    }

    @DeleteMapping("/{teamRoleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId
    ) {
        teamRoleService.deactivate(authenticatedUser, teamRoleId);
    }
}
