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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.skill.dto.AssignEmployeeSkillRequest;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse;
import me.aydgn.potriv.skill.dto.UpdateEmployeeSkillRequest;
import me.aydgn.potriv.skill.service.EmployeeSkillService;

/**
 * Self-service skill profile. Any authenticated organization user manages only
 * their own assignments; the user is always the authenticated principal.
 */
@RestController
@RequestMapping("/me/skills")
@Tag(name = "Employee Skills", description = "Self-service skill assignments for the current user")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class EmployeeSkillController {

    private final EmployeeSkillService employeeSkillService;

    public EmployeeSkillController(EmployeeSkillService employeeSkillService) {
        this.employeeSkillService = employeeSkillService;
    }

    @GetMapping
    public List<EmployeeSkillResponse> listOwn(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return employeeSkillService.listOwn(authenticatedUser);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeSkillResponse assign(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody AssignEmployeeSkillRequest request
    ) {
        return employeeSkillService.assign(authenticatedUser, request);
    }

    @PatchMapping("/{employeeSkillId}")
    public EmployeeSkillResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID employeeSkillId,
        @Valid @RequestBody UpdateEmployeeSkillRequest request
    ) {
        return employeeSkillService.update(authenticatedUser, employeeSkillId, request);
    }

    @DeleteMapping("/{employeeSkillId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID employeeSkillId
    ) {
        employeeSkillService.delete(authenticatedUser, employeeSkillId);
    }
}
