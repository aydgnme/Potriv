package me.aydgn.potriv.identity.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import me.aydgn.potriv.identity.dto.RegisterAdminRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminResponse;
import me.aydgn.potriv.identity.dto.RegisterEmployeeRequest;
import me.aydgn.potriv.identity.dto.RegisterEmployeeResponse;
import me.aydgn.potriv.identity.service.AuthRegistrationService;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthRegistrationService authRegistrationService;

    public AuthController(AuthRegistrationService authRegistrationService) {
        this.authRegistrationService = authRegistrationService;
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
}
