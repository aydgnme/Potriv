-- Refresh the security_audit_events.event_type CHECK constraint.
--
-- Adds ORGANIZATION_ADMIN_REGISTRATION_REQUESTED: workspace registration is
-- now request-then-confirm, and this records the request stage for every
-- address, mirroring PASSWORD_RESET_REQUESTED. ORGANIZATION_ADMIN_REGISTERED
-- stays in the list with its existing meaning — it now fires at confirmation
-- instead of at the request, but the value itself is unchanged.
--
-- A CHECK constraint cannot be extended in place; it is dropped and recreated
-- with the complete current value set. ProductionSchemaMigrationIntegrationTest
-- fails if this list ever falls behind the enum.

ALTER TABLE security_audit_events
    DROP CONSTRAINT IF EXISTS security_audit_events_event_type_check;

ALTER TABLE security_audit_events
    ADD CONSTRAINT security_audit_events_event_type_check CHECK (
        (event_type)::text = ANY (ARRAY[
        'ORGANIZATION_ADMIN_REGISTERED',
        'ORGANIZATION_ADMIN_REGISTRATION_REQUESTED',
        'EMPLOYEE_REGISTERED',
        'LOGIN_SUCCEEDED',
        'LOGIN_FAILED',
        'ACCOUNT_LOCKED',
        'TOKEN_REFRESHED',
        'REFRESH_TOKEN_REUSE_DETECTED',
        'LOGOUT',
        'LOGOUT_ALL',
        'SESSION_REVOKED',
        'PASSWORD_RESET_REQUESTED',
        'PASSWORD_RESET_COMPLETED',
        'USER_STATUS_CHANGED',
        'USER_ROLES_CHANGED',
        'EMPLOYEE_INVITE_ROTATED',
        'ADMIN_ORGANIZATION_UPDATED',
        'ADMIN_DEPARTMENT_CREATED',
        'ADMIN_DEPARTMENT_UPDATED',
        'ADMIN_DEPARTMENT_DELETE_BLOCKED',
        'ADMIN_DEPARTMENT_DELETED',
        'ADMIN_SKILL_CATEGORY_CREATED',
        'ADMIN_SKILL_CATEGORY_UPDATED',
        'ADMIN_SKILL_CREATED',
        'ADMIN_SKILL_UPDATED',
        'ADMIN_SKILL_DEACTIVATED',
        'ADMIN_SKILL_REACTIVATED',
        'ADMIN_SKILL_DEPARTMENT_LINK_ADDED',
        'ADMIN_SKILL_DEPARTMENT_LINK_REMOVED',
        'ADMIN_USER_PROFILE_UPDATED',
        'ADMIN_USER_STATUS_CHANGED',
        'ADMIN_USER_UNLOCKED',
        'ADMIN_USER_ACTION_BLOCKED',
        'ADMIN_USER_ROLE_GRANTED',
        'ADMIN_USER_ROLE_REVOKED',
        'ADMIN_USER_ROLE_ACTION_BLOCKED',
        'SYSTEM_ADMIN_BOOTSTRAP_CREATED',
        'SYSTEM_ADMIN_BOOTSTRAP_RECONCILED',
        'ADMIN_INVITATION_REVOKED',
        'ADMIN_INVITATION_REGENERATED',
        'ADMIN_PROJECT_STATUS_CHANGED',
        'ADMIN_PROJECT_DELETED',
        'ADMIN_PROJECT_ACTION_BLOCKED',
        'EMPLOYEE_INVITE_ISSUED',
        'EMPLOYEE_INVITE_REVOKED'
        ]::text[])
    );
