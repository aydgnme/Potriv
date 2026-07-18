package me.aydgn.potriv.project.departmentview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record DepartmentProjectsResponse(
    DepartmentProjectDepartmentSummary department,
    List<DepartmentProjectSummaryResponse> projects,
    OffsetDateTime generatedAt
) {

}
