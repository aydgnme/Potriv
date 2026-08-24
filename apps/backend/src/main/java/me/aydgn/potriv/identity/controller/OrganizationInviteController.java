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
     * Invites one person.
     *
     * The response never carries the link — see {@link EmployeeInviteResponse}.
     * Nothing is minted or mailed by this request at all: it records the
     * intention, and {@code InviteDeliveryWorker} mints the token and mails the
     * one link it produces, in a later transaction, to the address the
     * invitation was issued to.
     */
    @PostMapping
    /*
      202, not 201.

      The request records an intention to invite; the link is minted and mailed
      by a worker afterwards. Answering 201 "created" claimed something had
      been sent that had not — and, when the mail server was unreachable, never
      would be. The response carries the delivery state so the caller can say
      what is actually true.
    */
    @ResponseStatus(HttpStatus.ACCEPTED)
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
