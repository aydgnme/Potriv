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
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOrProjectManager;
import me.aydgn.potriv.organization.dto.CreateTeamRoleRequest;
import me.aydgn.potriv.organization.dto.TeamRoleResponse;
import me.aydgn.potriv.organization.dto.UpdateTeamRoleRequest;
import me.aydgn.potriv.organization.service.TeamRoleService;

@RestController
@RequestMapping("/team-roles")
@Tag(
    name = "Team Roles",
    description = "Organization-defined informational team roles. Distinct from access "
        + "roles: they never grant application permissions."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class TeamRoleController {

    /*
     * Authorization is declared per operation, deliberately, rather than once on
     * the class with exceptions layered underneath. The catalogue is owned by the
     * organization admin and read by the project manager, and that split is worth
     * being able to see without reasoning about annotation precedence.
     */

    private final TeamRoleService teamRoleService;

    public TeamRoleController(TeamRoleService teamRoleService) {
        this.teamRoleService = teamRoleService;
    }

    @PostMapping
    @OrganizationAdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public TeamRoleResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateTeamRoleRequest request
    ) {
        return teamRoleService.create(authenticatedUser, request);
    }

    /**
     * The catalogue a project's role requirements are chosen from.
     *
     * <p>A project manager may read it because {@code teamRoles[].teamRoleId} on
     * project create and update is catalog-backed, not free text — without this
     * they could own a project's requirements while being unable to name them.
     *
     * <p>{@code includeInactive} is open to them too: editing a project whose role
     * was deactivated afterwards has to render what is already attached. Reading a
     * deactivated role is not permission to newly attach one; that rule lives in
     * the project service and is unchanged.
     */
    @GetMapping
    @OrganizationAdminOrProjectManager
    public List<TeamRoleResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive
    ) {
        return teamRoleService.list(authenticatedUser, includeInactive);
    }

    /** Catalogue administration, not project authoring — organization admin only. */
    @GetMapping("/{teamRoleId}")
    @OrganizationAdminOnly
    public TeamRoleResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId
    ) {
        return teamRoleService.get(authenticatedUser, teamRoleId);
    }

    @PatchMapping("/{teamRoleId}")
    @OrganizationAdminOnly
    public TeamRoleResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId,
        @Valid @RequestBody UpdateTeamRoleRequest request
    ) {
        return teamRoleService.update(authenticatedUser, teamRoleId, request);
    }

    @DeleteMapping("/{teamRoleId}")
    @OrganizationAdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID teamRoleId
    ) {
        teamRoleService.deactivate(authenticatedUser, teamRoleId);
    }
}
