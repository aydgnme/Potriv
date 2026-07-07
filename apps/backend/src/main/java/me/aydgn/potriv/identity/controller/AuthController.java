package me.aydgn.potriv.identity.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.dto.CurrentUserResponse;
import me.aydgn.potriv.identity.dto.LoginRequest;
import me.aydgn.potriv.identity.dto.RefreshRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminResponse;
import me.aydgn.potriv.identity.dto.RegisterEmployeeRequest;
import me.aydgn.potriv.identity.dto.RegisterEmployeeResponse;
import me.aydgn.potriv.identity.dto.TokenPairResponse;
import me.aydgn.potriv.identity.service.AuthRegistrationService;
import me.aydgn.potriv.identity.service.JwtAuthenticationService;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthRegistrationService authRegistrationService;
    private final JwtAuthenticationService jwtAuthenticationService;

    public AuthController(
        AuthRegistrationService authRegistrationService,
        JwtAuthenticationService jwtAuthenticationService
    ) {
        this.authRegistrationService = authRegistrationService;
        this.jwtAuthenticationService = jwtAuthenticationService;
    }

    @PostMapping("/register-admin")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterAdminResponse registerOrganizationAdmin(
        @Valid @RequestBody RegisterAdminRequest request
    ) {
        return authRegistrationService.registerOrganizationAdmin(request);
    }

    @PostMapping("/register-employee/{inviteToken}")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterEmployeeResponse registerEmployee(
        @PathVariable String inviteToken,
        @Valid @RequestBody RegisterEmployeeRequest request
    ) {
        return authRegistrationService.registerEmployee(inviteToken, request);
    }

    @PostMapping("/login")
    public TokenPairResponse login(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest httpRequest
    ) {
        return jwtAuthenticationService.login(
            request,
            httpRequest.getHeader(HttpHeaders.USER_AGENT),
            httpRequest.getRemoteAddr()
        );
    }

    @PostMapping("/refresh")
    public TokenPairResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return jwtAuthenticationService.refresh(request);
    }

    @GetMapping("/me")
    public CurrentUserResponse me(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return new CurrentUserResponse(
            authenticatedUser.userId(),
            authenticatedUser.organizationId(),
            authenticatedUser.email(),
            authenticatedUser.roles()
        );
    }
}
