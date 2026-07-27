package me.aydgn.potriv.admin.viewmodel;

/**
 * Read models for the user role-management page.
 */
public final class AdminUserRoleViews {

    private AdminUserRoleViews() {
    }

    /**
     * One manageable role row: whether the user holds it, and — when held —
     * whether revoking it is currently blocked by a domain dependency and why.
     */
    public record RoleRow(
        String role,
        boolean held,
        boolean revokeBlocked,
        String revokeBlockReason
    ) {
    }
}
