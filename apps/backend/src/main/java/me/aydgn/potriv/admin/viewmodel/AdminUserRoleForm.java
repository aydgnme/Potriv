package me.aydgn.potriv.admin.viewmodel;

import jakarta.validation.constraints.NotBlank;

/**
 * Form bean for a single role grant/revoke action. The role name is validated by
 * {@code AdminUserRoleWriteService} against the manageable set; {@code SYSTEM_ADMIN}
 * and unknown values are rejected there, so form tampering cannot bypass the rule.
 */
public final class AdminUserRoleForm {

    @NotBlank(message = "Role is required.")
    private String role;

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
}
