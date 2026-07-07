package me.aydgn.potriv.support;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;
import me.aydgn.potriv.common.security.annotation.EmployeeOnly;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.common.security.annotation.ProjectManagerOnly;
import me.aydgn.potriv.common.security.annotation.SystemAdminOnly;

/**
 * Test-only controller that isolates each RBAC meta-annotation behind a
 * dedicated endpoint. It exists solely in test sources so no production demo
 * endpoint is shipped.
 */
@RestController
@RequestMapping("/test-rbac")
public class RbacTestController {

    @GetMapping("/system-admin")
    @SystemAdminOnly
    public String systemAdminOnly() {
        return "system-admin";
    }

    @GetMapping("/organization-admin")
    @OrganizationAdminOnly
    public String organizationAdminOnly() {
        return "organization-admin";
    }

    @GetMapping("/department-manager")
    @DepartmentManagerOnly
    public String departmentManagerOnly() {
        return "department-manager";
    }

    @GetMapping("/project-manager")
    @ProjectManagerOnly
    public String projectManagerOnly() {
        return "project-manager";
    }

    @GetMapping("/employee")
    @EmployeeOnly
    public String employeeOnly() {
        return "employee";
    }
}
