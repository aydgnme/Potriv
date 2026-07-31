-- Potriv application schema baseline.
--
-- Generated from the Hibernate-created PostgreSQL 16 schema of the current JPA
-- entity model (pg_dump --schema-only --no-owner --no-privileges), then cleaned
-- of psql meta-commands, session SET statements, and the public. qualifier so it
-- applies to the connection's default schema.
--
-- Production runs Flyway with spring.jpa.hibernate.ddl-auto=validate: this file
-- is the source of truth for the schema, not Hibernate. Any future entity or
-- enum change needs its own new migration (V3+, never edit an applied file).
--
-- Enum-backed columns carry CHECK constraints listing the exact values Hibernate
-- expects. Adding an enum constant therefore requires a migration that refreshes
-- the matching CHECK constraint.

CREATE TABLE department_manager_assignments (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    assigned_by_user_id uuid NOT NULL,
    department_id uuid NOT NULL,
    id uuid NOT NULL,
    manager_user_id uuid NOT NULL
);

CREATE TABLE department_memberships (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    assigned_by_user_id uuid NOT NULL,
    department_id uuid NOT NULL,
    id uuid NOT NULL,
    member_user_id uuid NOT NULL
);

CREATE TABLE departments (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(160) NOT NULL,
    normalized_name character varying(160) NOT NULL
);

CREATE TABLE employee_skills (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    skill_id uuid NOT NULL,
    user_id uuid NOT NULL,
    level character varying(20) NOT NULL,
    experience character varying(40) NOT NULL,
    CONSTRAINT employee_skills_experience_check CHECK (((experience)::text = ANY ((ARRAY['ZERO_TO_SIX_MONTHS'::character varying, 'SIX_TO_TWELVE_MONTHS'::character varying, 'ONE_TO_TWO_YEARS'::character varying, 'TWO_TO_FOUR_YEARS'::character varying, 'FOUR_TO_SEVEN_YEARS'::character varying, 'MORE_THAN_SEVEN_YEARS'::character varying])::text[]))),
    CONSTRAINT employee_skills_level_check CHECK (((level)::text = ANY ((ARRAY['LEARNS'::character varying, 'KNOWS'::character varying, 'DOES'::character varying, 'HELPS'::character varying, 'TEACHES'::character varying])::text[])))
);

CREATE TABLE invite_tokens (
    active boolean NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    expires_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    token character varying(120) NOT NULL
);

CREATE TABLE organizations (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    name character varying(160) NOT NULL,
    headquarter_address text NOT NULL
);

CREATE TABLE password_reset_tokens (
    created_at timestamp(6) with time zone NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    used_at timestamp(6) with time zone,
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL
);

CREATE TABLE project_allocations (
    work_hours_per_day integer NOT NULL,
    allocated_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    deallocated_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    assignment_proposal_id uuid NOT NULL,
    employee_user_id uuid NOT NULL,
    id uuid NOT NULL,
    project_id uuid NOT NULL
);

CREATE TABLE project_assignment_proposal_roles (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    team_role_id uuid NOT NULL
);

CREATE TABLE project_assignment_proposals (
    work_hours_per_day integer NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    reviewed_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    employee_user_id uuid NOT NULL,
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    proposed_by_user_id uuid NOT NULL,
    review_department_id uuid NOT NULL,
    reviewed_by_user_id uuid,
    status character varying(20) NOT NULL,
    comments character varying(5000),
    CONSTRAINT project_assignment_proposals_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);

CREATE TABLE project_deallocation_proposals (
    created_at timestamp(6) with time zone NOT NULL,
    reviewed_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    allocation_id uuid NOT NULL,
    id uuid NOT NULL,
    proposed_by_user_id uuid NOT NULL,
    review_department_id uuid NOT NULL,
    reviewed_by_user_id uuid,
    status character varying(20) NOT NULL,
    reason character varying(5000) NOT NULL,
    CONSTRAINT project_deallocation_proposals_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);

CREATE TABLE project_status_history (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    changed_by_user_id uuid NOT NULL,
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    from_status character varying(20),
    to_status character varying(20) NOT NULL,
    CONSTRAINT project_status_history_from_status_check CHECK (((from_status)::text = ANY ((ARRAY['NOT_STARTED'::character varying, 'STARTING'::character varying, 'IN_PROGRESS'::character varying, 'CLOSING'::character varying, 'CLOSED'::character varying])::text[]))),
    CONSTRAINT project_status_history_to_status_check CHECK (((to_status)::text = ANY ((ARRAY['NOT_STARTED'::character varying, 'STARTING'::character varying, 'IN_PROGRESS'::character varying, 'CLOSING'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE project_team_role_requirements (
    required_members integer NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    team_role_id uuid NOT NULL
);

CREATE TABLE project_technologies (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name character varying(160) NOT NULL,
    normalized_name character varying(160) NOT NULL
);

CREATE TABLE projects (
    deadline_date date,
    start_date date NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_manager_user_id uuid NOT NULL,
    period character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    general_description character varying(10000),
    CONSTRAINT projects_period_check CHECK (((period)::text = ANY ((ARRAY['FIXED'::character varying, 'ONGOING'::character varying])::text[]))),
    CONSTRAINT projects_status_check CHECK (((status)::text = ANY ((ARRAY['NOT_STARTED'::character varying, 'STARTING'::character varying, 'IN_PROGRESS'::character varying, 'CLOSING'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE refresh_tokens (
    created_at timestamp(6) with time zone NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    used_at timestamp(6) with time zone,
    id uuid NOT NULL,
    replaced_by_token_id uuid,
    session_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL
);

CREATE TABLE security_audit_events (
    success boolean NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    actor_user_id uuid,
    id uuid NOT NULL,
    organization_id uuid,
    session_id uuid,
    user_id uuid,
    event_type character varying(60) NOT NULL,
    ip_address character varying(64),
    normalized_email character varying(180),
    details text,
    user_agent character varying(255),
    CONSTRAINT security_audit_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['ORGANIZATION_ADMIN_REGISTERED'::character varying, 'EMPLOYEE_REGISTERED'::character varying, 'LOGIN_SUCCEEDED'::character varying, 'LOGIN_FAILED'::character varying, 'ACCOUNT_LOCKED'::character varying, 'TOKEN_REFRESHED'::character varying, 'REFRESH_TOKEN_REUSE_DETECTED'::character varying, 'LOGOUT'::character varying, 'LOGOUT_ALL'::character varying, 'SESSION_REVOKED'::character varying, 'PASSWORD_RESET_REQUESTED'::character varying, 'PASSWORD_RESET_COMPLETED'::character varying, 'USER_STATUS_CHANGED'::character varying, 'USER_ROLES_CHANGED'::character varying, 'EMPLOYEE_INVITE_ROTATED'::character varying, 'ADMIN_ORGANIZATION_UPDATED'::character varying, 'ADMIN_DEPARTMENT_CREATED'::character varying, 'ADMIN_DEPARTMENT_UPDATED'::character varying, 'ADMIN_DEPARTMENT_DELETE_BLOCKED'::character varying, 'ADMIN_DEPARTMENT_DELETED'::character varying, 'ADMIN_SKILL_CATEGORY_CREATED'::character varying, 'ADMIN_SKILL_CATEGORY_UPDATED'::character varying, 'ADMIN_SKILL_CREATED'::character varying, 'ADMIN_SKILL_UPDATED'::character varying, 'ADMIN_SKILL_DEACTIVATED'::character varying, 'ADMIN_SKILL_REACTIVATED'::character varying, 'ADMIN_SKILL_DEPARTMENT_LINK_ADDED'::character varying, 'ADMIN_SKILL_DEPARTMENT_LINK_REMOVED'::character varying, 'ADMIN_USER_PROFILE_UPDATED'::character varying, 'ADMIN_USER_STATUS_CHANGED'::character varying, 'ADMIN_USER_UNLOCKED'::character varying, 'ADMIN_USER_ACTION_BLOCKED'::character varying, 'ADMIN_USER_ROLE_GRANTED'::character varying, 'ADMIN_USER_ROLE_REVOKED'::character varying, 'ADMIN_USER_ROLE_ACTION_BLOCKED'::character varying])::text[])))
);

CREATE TABLE skill_categories (
    active boolean NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    normalized_name character varying(120) NOT NULL
);

CREATE TABLE skill_department_links (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    department_id uuid NOT NULL,
    id uuid NOT NULL,
    linked_by_user_id uuid NOT NULL,
    skill_id uuid NOT NULL
);

CREATE TABLE skills (
    active boolean NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    author_user_id uuid NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    skill_category_id uuid NOT NULL,
    name character varying(160) NOT NULL,
    normalized_name character varying(160) NOT NULL,
    description character varying(4000)
);

CREATE TABLE team_roles (
    active boolean NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    normalized_name character varying(120) NOT NULL,
    description character varying(1000)
);

CREATE TABLE user_roles (
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(40) NOT NULL,
    CONSTRAINT user_roles_role_check CHECK (((role)::text = ANY ((ARRAY['EMPLOYEE'::character varying, 'ORGANIZATION_ADMIN'::character varying, 'DEPARTMENT_MANAGER'::character varying, 'PROJECT_MANAGER'::character varying, 'SYSTEM_ADMIN'::character varying])::text[])))
);

CREATE TABLE user_sessions (
    created_at timestamp(6) with time zone NOT NULL,
    last_seen_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    ip_address character varying(64),
    user_agent character varying(255)
);

CREATE TABLE users (
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    locked_until timestamp(6) with time zone,
    updated_at timestamp(6) with time zone NOT NULL,
    id uuid NOT NULL,
    organization_id uuid,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    name character varying(120) NOT NULL,
    email character varying(180) NOT NULL,
    password_hash character varying(255) NOT NULL,
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUSPENDED'::character varying, 'DISABLED'::character varying])::text[])))
);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT department_manager_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY department_memberships
    ADD CONSTRAINT department_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY employee_skills
    ADD CONSTRAINT employee_skills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invite_tokens
    ADD CONSTRAINT invite_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY project_allocations
    ADD CONSTRAINT project_allocations_assignment_proposal_id_key UNIQUE (assignment_proposal_id);

ALTER TABLE ONLY project_allocations
    ADD CONSTRAINT project_allocations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_assignment_proposal_roles
    ADD CONSTRAINT project_assignment_proposal_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT project_assignment_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_deallocation_proposals
    ADD CONSTRAINT project_deallocation_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_status_history
    ADD CONSTRAINT project_status_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_team_role_requirements
    ADD CONSTRAINT project_team_role_requirements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY project_technologies
    ADD CONSTRAINT project_technologies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY security_audit_events
    ADD CONSTRAINT security_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY skill_categories
    ADD CONSTRAINT skill_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY skill_department_links
    ADD CONSTRAINT skill_department_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY team_roles
    ADD CONSTRAINT team_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY departments
    ADD CONSTRAINT uq_departments_organization_normalized_name UNIQUE (organization_id, normalized_name);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT uq_dept_manager_assignment_department UNIQUE (department_id);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT uq_dept_manager_assignment_manager UNIQUE (manager_user_id);

ALTER TABLE ONLY department_memberships
    ADD CONSTRAINT uq_dept_membership_member UNIQUE (member_user_id);

ALTER TABLE ONLY employee_skills
    ADD CONSTRAINT uq_employee_skills_user_skill UNIQUE (user_id, skill_id);

ALTER TABLE ONLY project_assignment_proposal_roles
    ADD CONSTRAINT uq_project_assignment_proposal_roles_proposal_team_role UNIQUE (proposal_id, team_role_id);

ALTER TABLE ONLY project_team_role_requirements
    ADD CONSTRAINT uq_project_team_role_requirements_project_team_role UNIQUE (project_id, team_role_id);

ALTER TABLE ONLY project_technologies
    ADD CONSTRAINT uq_project_technologies_project_normalized_name UNIQUE (project_id, normalized_name);

ALTER TABLE ONLY skill_categories
    ADD CONSTRAINT uq_skill_categories_organization_normalized_name UNIQUE (organization_id, normalized_name);

ALTER TABLE ONLY skill_department_links
    ADD CONSTRAINT uq_skill_department_links_skill_department UNIQUE (skill_id, department_id);

ALTER TABLE ONLY skills
    ADD CONSTRAINT uq_skills_organization_category_normalized_name UNIQUE (organization_id, skill_category_id, normalized_name);

ALTER TABLE ONLY team_roles
    ADD CONSTRAINT uq_team_roles_organization_normalized_name UNIQUE (organization_id, normalized_name);

ALTER TABLE ONLY user_roles
    ADD CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role);

ALTER TABLE ONLY user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX idx_departments_organization_id ON departments USING btree (organization_id);

CREATE INDEX idx_dept_memberships_department_id ON department_memberships USING btree (department_id);

CREATE INDEX idx_employee_skills_skill_id ON employee_skills USING btree (skill_id);

CREATE INDEX idx_employee_skills_user_id ON employee_skills USING btree (user_id);

CREATE INDEX idx_invite_tokens_organization_id ON invite_tokens USING btree (organization_id);

CREATE INDEX idx_invite_tokens_token ON invite_tokens USING btree (token);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens USING btree (user_id);

CREATE INDEX idx_project_allocations_deallocated_at ON project_allocations USING btree (deallocated_at);

CREATE INDEX idx_project_allocations_employee_user_id ON project_allocations USING btree (employee_user_id);

CREATE INDEX idx_project_allocations_project_id ON project_allocations USING btree (project_id);

CREATE INDEX idx_project_assignment_proposal_roles_proposal_id ON project_assignment_proposal_roles USING btree (proposal_id);

CREATE INDEX idx_project_assignment_proposal_roles_team_role_id ON project_assignment_proposal_roles USING btree (team_role_id);

CREATE INDEX idx_project_assignment_proposals_employee_user_id ON project_assignment_proposals USING btree (employee_user_id);

CREATE INDEX idx_project_assignment_proposals_project_id ON project_assignment_proposals USING btree (project_id);

CREATE INDEX idx_project_assignment_proposals_review_department_id ON project_assignment_proposals USING btree (review_department_id);

CREATE INDEX idx_project_assignment_proposals_status ON project_assignment_proposals USING btree (status);

CREATE INDEX idx_project_deallocation_proposals_allocation_id ON project_deallocation_proposals USING btree (allocation_id);

CREATE INDEX idx_project_deallocation_proposals_review_department_id ON project_deallocation_proposals USING btree (review_department_id);

CREATE INDEX idx_project_deallocation_proposals_status ON project_deallocation_proposals USING btree (status);

CREATE INDEX idx_project_status_history_project_id ON project_status_history USING btree (project_id);

CREATE INDEX idx_project_team_role_requirements_project_id ON project_team_role_requirements USING btree (project_id);

CREATE INDEX idx_project_team_role_requirements_team_role_id ON project_team_role_requirements USING btree (team_role_id);

CREATE INDEX idx_project_technologies_project_id ON project_technologies USING btree (project_id);

CREATE INDEX idx_projects_deadline_date ON projects USING btree (deadline_date);

CREATE INDEX idx_projects_organization_id ON projects USING btree (organization_id);

CREATE INDEX idx_projects_project_manager_user_id ON projects USING btree (project_manager_user_id);

CREATE INDEX idx_projects_status ON projects USING btree (status);

CREATE INDEX idx_refresh_tokens_session_id ON refresh_tokens USING btree (session_id);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens USING btree (token_hash);

CREATE INDEX idx_security_audit_events_created_at ON security_audit_events USING btree (created_at);

CREATE INDEX idx_security_audit_events_event_type ON security_audit_events USING btree (event_type);

CREATE INDEX idx_security_audit_events_organization_id ON security_audit_events USING btree (organization_id);

CREATE INDEX idx_security_audit_events_user_id ON security_audit_events USING btree (user_id);

CREATE INDEX idx_skill_categories_organization_id ON skill_categories USING btree (organization_id);

CREATE INDEX idx_skill_department_links_department_id ON skill_department_links USING btree (department_id);

CREATE INDEX idx_skill_department_links_skill_id ON skill_department_links USING btree (skill_id);

CREATE INDEX idx_skills_author_id ON skills USING btree (author_user_id);

CREATE INDEX idx_skills_category_id ON skills USING btree (skill_category_id);

CREATE INDEX idx_skills_organization_id ON skills USING btree (organization_id);

CREATE INDEX idx_team_roles_organization_id ON team_roles USING btree (organization_id);

CREATE INDEX idx_user_roles_user_id ON user_roles USING btree (user_id);

CREATE INDEX idx_user_sessions_user_id ON user_sessions USING btree (user_id);

CREATE INDEX idx_users_email ON users USING btree (email);

CREATE INDEX idx_users_organization_id ON users USING btree (organization_id);

ALTER TABLE ONLY skill_department_links
    ADD CONSTRAINT fk13ix335220da4qwvm6upikya8 FOREIGN KEY (skill_id) REFERENCES skills(id);

ALTER TABLE ONLY project_team_role_requirements
    ADD CONSTRAINT fk15cuyvl2ijme9gs7slbis9mnm FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT fk1d6wyeyyggupch5djhfl2h29r FOREIGN KEY (review_department_id) REFERENCES departments(id);

ALTER TABLE ONLY project_allocations
    ADD CONSTRAINT fk1fe2950v6jppsr76yjf32cf7c FOREIGN KEY (assignment_proposal_id) REFERENCES project_assignment_proposals(id);

ALTER TABLE ONLY department_memberships
    ADD CONSTRAINT fk1gs9kxryo2nqryuxbidv2oqxq FOREIGN KEY (assigned_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY department_memberships
    ADD CONSTRAINT fk2nitdpuyw63no0683g95gcmn0 FOREIGN KEY (department_id) REFERENCES departments(id);

ALTER TABLE ONLY projects
    ADD CONSTRAINT fk3gwrleyyq6prcnqekmkobbimd FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY refresh_tokens
    ADD CONSTRAINT fk3oc3y1jbad69c3h7y2fv88hsu FOREIGN KEY (session_id) REFERENCES user_sessions(id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT fk3sh2i2ukt8y4ap5a1t4qj8kti FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE ONLY project_status_history
    ADD CONSTRAINT fk4teg97sre9dnxkl3gg5bvwace FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE ONLY department_memberships
    ADD CONSTRAINT fk5a0ibefjd6crh4i1t6dfyglf0 FOREIGN KEY (member_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_team_role_requirements
    ADD CONSTRAINT fk62abj0admu3cfji66xjsfojo2 FOREIGN KEY (team_role_id) REFERENCES team_roles(id);

ALTER TABLE ONLY departments
    ADD CONSTRAINT fk69kdxq27lkb5p622ypc93tcr4 FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY project_allocations
    ADD CONSTRAINT fk6t1p8ypdrwo1y2altesnt7o06 FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE ONLY project_assignment_proposal_roles
    ADD CONSTRAINT fk7yqash88gt9cwfwh0969al3f5 FOREIGN KEY (team_role_id) REFERENCES team_roles(id);

ALTER TABLE ONLY employee_skills
    ADD CONSTRAINT fk8anwsnenk9d8nirjuov0ywinb FOREIGN KEY (skill_id) REFERENCES skills(id);

ALTER TABLE ONLY user_sessions
    ADD CONSTRAINT fk8klxsgb8dcjjklmqebqp1twd5 FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY employee_skills
    ADD CONSTRAINT fk8vj4ohmuq1qodn71h86elnfao FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY project_allocations
    ADD CONSTRAINT fk99vvai7d5h7bo97y9b7yb8nif FOREIGN KEY (employee_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT fk9mm63ylh2dchsja5o5c59ws6d FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY projects
    ADD CONSTRAINT fk9vsvj6rjnws2vbdd7k8bsh3j1 FOREIGN KEY (project_manager_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT fkb48osscqryiy4fudil6jmep4r FOREIGN KEY (employee_user_id) REFERENCES users(id);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT fkb9g0pv81v1tqjgmlab8k04py8 FOREIGN KEY (assigned_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_deallocation_proposals
    ADD CONSTRAINT fkbtpyr54ct1voqh92vt6omfj4r FOREIGN KEY (proposed_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY skills
    ADD CONSTRAINT fkbxu95fg0qot0t3wenbv212edf FOREIGN KEY (skill_category_id) REFERENCES skill_categories(id);

ALTER TABLE ONLY invite_tokens
    ADD CONSTRAINT fkc4dgvgmhaslc5q4dgc4570k0v FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT fkcb5b8a3e6q6wkggash6c7j56s FOREIGN KEY (manager_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_assignment_proposal_roles
    ADD CONSTRAINT fkergwg0d70s8vrtrqp8e1y1a9p FOREIGN KEY (proposal_id) REFERENCES project_assignment_proposals(id);

ALTER TABLE ONLY skill_department_links
    ADD CONSTRAINT fkh1hfe15c6v2cw6a5ka1hfxmdd FOREIGN KEY (department_id) REFERENCES departments(id);

ALTER TABLE ONLY skill_categories
    ADD CONSTRAINT fkhbj98fso9kp3v0oqp9d1tswcg FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY user_roles
    ADD CONSTRAINT fkhfh9dx7w3ubf1co1vdev94g3f FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY project_assignment_proposals
    ADD CONSTRAINT fki9i11d7wd0v3vbbeon0jkubr4 FOREIGN KEY (proposed_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_status_history
    ADD CONSTRAINT fkj575crlr8p1gtqpw9yw1ym6yr FOREIGN KEY (changed_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_deallocation_proposals
    ADD CONSTRAINT fkjc3xr4p7l3wn9sjhhafj7jics FOREIGN KEY (review_department_id) REFERENCES departments(id);

ALTER TABLE ONLY project_deallocation_proposals
    ADD CONSTRAINT fkjuaind38s11s5bu356xss7slp FOREIGN KEY (allocation_id) REFERENCES project_allocations(id);

ALTER TABLE ONLY department_manager_assignments
    ADD CONSTRAINT fkjyydgpt7yarwhos806os3x2xi FOREIGN KEY (department_id) REFERENCES departments(id);

ALTER TABLE ONLY skills
    ADD CONSTRAINT fkk02l4igac6f9257awlj4vgl05 FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT fkk3ndxg5xp6v7wd4gjyusp15gq FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY project_deallocation_proposals
    ADD CONSTRAINT fkle99p2uaotr250co4bbn6wp04 FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY project_technologies
    ADD CONSTRAINT fkm4n7vw6u2ilmq85adm4igx3m1 FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE ONLY skill_department_links
    ADD CONSTRAINT fknschq2bukxesynucjkho277st FOREIGN KEY (linked_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY users
    ADD CONSTRAINT fkqpugllwvyv37klq7ft9m8aqxk FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY team_roles
    ADD CONSTRAINT fksruvbr50hslf045x6lyupc3pb FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ONLY skills
    ADD CONSTRAINT fktd302hn2n2uhnm9m6bbqog2h5 FOREIGN KEY (author_user_id) REFERENCES users(id);
