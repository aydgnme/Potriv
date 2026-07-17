package me.aydgn.potriv.project.employeeview.dto;

import java.util.UUID;

public record EmployeeProjectRoleSummary(
    UUID teamRoleId,
    String name,
    boolean active
) {

}
