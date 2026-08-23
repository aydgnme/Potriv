package me.aydgn.potriv.identity.controller;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.identity.dto.EmployeeInviteResponse;
import me.aydgn.potriv.identity.dto.InviteEmployeeRequest;
import me.aydgn.potriv.identity.service.OrganizationInviteService;

@RestController
@RequestMapping("/organizations/current/invites")
@Tag(name = "Organization Invites", description = "Employee invite lifecycle management")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class OrganizationInviteController {

    private final OrganizationInviteService organizationInviteService;

    public OrganizationInviteController(OrganizationInviteService organizationInviteService) {
        this.organizationInviteService = organizationInviteService;
    }

    /** Every invite this organization has issued. Never carries a link. */
    @GetMapping
    @OrganizationAdminOnly
    public List<EmployeeInviteResponse> listInvites(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return organizationInviteService.listInvites(authenticatedUser);
    }

    /**
     * Invites one person. The response is the only place the link appears, and
     * the same link is emailed to the address it was issued to.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @OrganizationAdminOnly
    public EmployeeInviteResponse inviteEmployee(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody InviteEmployeeRequest request
    ) {
        return organizationInviteService.inviteEmployee(authenticatedUser, request.email());
    }

    @DeleteMapping("/{inviteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @OrganizationAdminOnly
    public void revokeInvite(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID inviteId
    ) {
        organizationInviteService.revokeInvite(authenticatedUser, inviteId);
    }
}
