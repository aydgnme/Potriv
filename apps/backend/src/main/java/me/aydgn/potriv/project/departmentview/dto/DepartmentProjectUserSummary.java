package me.aydgn.potriv.project.departmentview.dto;

import java.util.UUID;

public record DepartmentProjectUserSummary(
    UUID userId,
    String name,
    String email
) {

}
