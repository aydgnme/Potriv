package me.aydgn.potriv.admin.viewmodel;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Form-binding beans and read models for department admin writes. Only editable
 * fields are bound; JPA entities are never surfaced to the form binder.
 */
public final class AdminDepartmentForms {

    private AdminDepartmentForms() {
    }

    /** Create form: pick an existing organization and name the department.
     *  The organization id is bound as text so an unselected/invalid value fails
     *  validation cleanly instead of throwing a UUID conversion error. */
    public static final class CreateForm {

        @NotBlank(message = "Organization is required.")
        private String organizationId;

        @NotBlank(message = "Name is required.")
        @Size(max = 160, message = "Name must be at most 160 characters.")
        private String name;

        public String getOrganizationId() {
            return organizationId;
        }

        public void setOrganizationId(String organizationId) {
            this.organizationId = organizationId;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }

    /** Edit form: department name only. Organization is immutable after creation. */
    public static final class EditForm {

        @NotBlank(message = "Name is required.")
        @Size(max = 160, message = "Name must be at most 160 characters.")
        private String name;

        public EditForm() {
        }

        public EditForm(String name) {
            this.name = name;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }

    /** A selectable organization for the create form's human-readable dropdown. */
    public record OrganizationOption(UUID id, String name) {
    }

    /**
     * Read-only dependency snapshot used by the delete confirmation page and the
     * delete decision. {@link #blocked()} is true when any dependent domain data
     * exists — the department must not be deleted in that case.
     */
    public record Dependencies(
        long members,
        boolean hasManager,
        long skillLinks,
        boolean assignmentProposals,
        boolean deallocationProposals
    ) {

        public boolean blocked() {
            return members > 0 || hasManager || skillLinks > 0
                || assignmentProposals || deallocationProposals;
        }
    }
}
