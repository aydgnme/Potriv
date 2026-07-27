package me.aydgn.potriv.admin.viewmodel;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Form-binding beans for user account administration. Only the display name is
 * bound — email, password, organization, roles, and status are never editable
 * through these forms.
 */
public final class AdminUserForms {

    private AdminUserForms() {
    }

    /** Edit form: display name only. */
    public static final class NameEditForm {

        @NotBlank(message = "Name is required.")
        @Size(max = 120, message = "Name must be at most 120 characters.")
        private String name;

        public NameEditForm() {
        }

        public NameEditForm(String name) {
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
