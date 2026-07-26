package me.aydgn.potriv.admin.viewmodel;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Form-binding beans for organization admin writes. Deliberately narrow — only
 * the fields an admin may edit are bound, so JPA entities are never exposed to
 * mass assignment.
 */
public final class AdminOrganizationForms {

    private AdminOrganizationForms() {
    }

    /** Edit form: organization name only. */
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
}
