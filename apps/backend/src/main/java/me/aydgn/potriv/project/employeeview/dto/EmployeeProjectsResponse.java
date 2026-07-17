package me.aydgn.potriv.project.employeeview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record EmployeeProjectsResponse(
    UUID userId,
    String userName,
    String userEmail,
    List<EmployeeProjectItemResponse> currentProjects,
    List<EmployeeProjectItemResponse> pastProjects,
    OffsetDateTime generatedAt
) {

}
