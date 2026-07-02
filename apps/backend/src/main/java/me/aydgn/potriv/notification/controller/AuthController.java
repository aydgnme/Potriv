package me.aydgn.potriv.notification.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import me.aydgn.potriv.identity.dto.AuthUserResponse;
import me.aydgn.potriv.identity.dto.RegisterAdminRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminResponse;
import me.aydgn.potriv.identity.dto.RegisterEmployeeRequest;
import me.aydgn.potriv.identity.dto.RegisterEmployeeResponse;
import me.aydgn.potriv.identity.service.AuthService;


@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register-admin")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterAdminResponse registerOrganizationAdmin(
        @Valid @RequestBody RegisterAdminRequest request
    ) {
        return authService.registerOrganizationAdmin(request);
    }

    @PostMapping("/register-employee/{inviteToken}")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisterEmployeeResponse registerEmployee(
        @PathVariable String inviteToken,
        @Valid @RequestBody RegisterEmployeeRequest request
    ) {
        return authService.registerEmployee(inviteToken, request);
    }

    @GetMapping("/users/{userId}")
    public AuthUserResponse getUser( @PathVariable UUID userId ) {
        return authService.getUser(userId);
    }
    
    
    
}
