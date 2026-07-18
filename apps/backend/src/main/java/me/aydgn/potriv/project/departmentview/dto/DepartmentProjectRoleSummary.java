package me.aydgn.potriv.project.departmentview.dto;

import java.util.UUID;

public record DepartmentProjectRoleSummary(
    UUID teamRoleId,
    String name,
    boolean active
) {

}
