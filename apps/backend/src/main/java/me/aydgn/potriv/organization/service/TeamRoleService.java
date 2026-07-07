package me.aydgn.potriv.organization.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.organization.dto.CreateTeamRoleRequest;
import me.aydgn.potriv.organization.dto.TeamRoleResponse;
import me.aydgn.potriv.organization.dto.UpdateTeamRoleRequest;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

@Service
public class TeamRoleService {

    private final TeamRoleRepository teamRoleRepository;
    private final OrganizationRepository organizationRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public TeamRoleService(
        TeamRoleRepository teamRoleRepository,
        OrganizationRepository organizationRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.teamRoleRepository = teamRoleRepository;
        this.organizationRepository = organizationRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional
    public TeamRoleResponse create(AuthenticatedUser currentUser, CreateTeamRoleRequest request) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        String name = request.name().trim();
        String normalizedName = normalize(name);

        ensureNameAvailable(organizationId, normalizedName);

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        TeamRole teamRole = teamRoleRepository.save(new TeamRole(
            organization,
            name,
            normalizedName,
            trimToNull(request.description())
        ));

        return toResponse(teamRole);
    }

    @Transactional(readOnly = true)
    public List<TeamRoleResponse> list(AuthenticatedUser currentUser, boolean includeInactive) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        List<TeamRole> teamRoles = includeInactive
            ? teamRoleRepository.findByOrganization_IdOrderByNameAsc(organizationId)
            : teamRoleRepository.findByOrganization_IdAndActiveTrueOrderByNameAsc(organizationId);

        return teamRoles.stream().map(TeamRoleService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public TeamRoleResponse get(AuthenticatedUser currentUser, UUID teamRoleId) {
        return toResponse(requireOwnedTeamRole(currentUser, teamRoleId));
    }

    @Transactional
    public TeamRoleResponse update(
        AuthenticatedUser currentUser,
        UUID teamRoleId,
        UpdateTeamRoleRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        TeamRole teamRole = requireOwnedTeamRole(organizationId, teamRoleId);

        if (request.name() != null) {
            String name = request.name().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("name must not be blank.");
            }

            String normalizedName = normalize(name);
            if (!normalizedName.equals(teamRole.getNormalizedName())) {
                ensureNameAvailable(organizationId, normalizedName);
            }
            teamRole.rename(name, normalizedName);
        }

        if (request.description() != null) {
            teamRole.changeDescription(trimToNull(request.description()));
        }

        if (request.active() != null) {
            if (request.active()) {
                teamRole.activate();
            } else {
                teamRole.deactivate();
            }
        }

        return toResponse(teamRole);
    }

    @Transactional
    public void deactivate(AuthenticatedUser currentUser, UUID teamRoleId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Idempotent, non-destructive deletion: the row stays resolvable by ID so
        // future historical project assignments can still reference it.
        teamRoleRepository.findByIdAndOrganization_Id(teamRoleId, organizationId)
            .ifPresent(TeamRole::deactivate);
    }

    private void ensureNameAvailable(UUID organizationId, String normalizedName) {
        teamRoleRepository
            .findByOrganization_IdAndNormalizedName(organizationId, normalizedName)
            .ifPresent(existing -> {
                throw new ConflictException(
                    "A team role with this name already exists in the organization.");
            });
    }

    private TeamRole requireOwnedTeamRole(AuthenticatedUser currentUser, UUID teamRoleId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        return requireOwnedTeamRole(organizationId, teamRoleId);
    }

    private TeamRole requireOwnedTeamRole(UUID organizationId, UUID teamRoleId) {
        return teamRoleRepository.findByIdAndOrganization_Id(teamRoleId, organizationId)
            .orElseThrow(() -> new NotFoundException("Team role was not found."));
    }

    private static String normalize(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static TeamRoleResponse toResponse(TeamRole teamRole) {
        return new TeamRoleResponse(
            teamRole.getId(),
            teamRole.getName(),
            teamRole.getDescription(),
            teamRole.isActive(),
            teamRole.getCreatedAt(),
            teamRole.getUpdatedAt()
        );
    }
}
