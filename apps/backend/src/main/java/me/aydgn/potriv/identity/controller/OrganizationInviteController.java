package me.aydgn.potriv.identity.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.identity.dto.EmployeeInviteResponse;
import me.aydgn.potriv.identity.service.OrganizationInviteService;

@RestController
@RequestMapping("/organizations/current/invite")
public class OrganizationInviteController {

    private final OrganizationInviteService organizationInviteService;

    public OrganizationInviteController(OrganizationInviteService organizationInviteService) {
        this.organizationInviteService = organizationInviteService;
    }

    @GetMapping
    @OrganizationAdminOnly
    public EmployeeInviteResponse getCurrentInvite(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return organizationInviteService.getCurrentInvite(authenticatedUser);
    }

    @PostMapping("/rotate")
    @OrganizationAdminOnly
    public EmployeeInviteResponse rotateInvite(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return organizationInviteService.rotateInvite(authenticatedUser);
    }
}
