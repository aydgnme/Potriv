package me.aydgn.potriv.admin.viewmodel;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Form-binding beans and select-option records for the skill-catalog admin
 * forms. Ids are bound as text so unselected/invalid values fail validation
 * cleanly rather than throwing a UUID conversion error, matching the department
 * forms. JPA entities are never bound to the forms.
 */
public final class AdminSkillCatalogForms {

    private AdminSkillCatalogForms() {
    }

    /** A selectable organization. */
    public record OrganizationOption(UUID id, String name) {
    }

    /** A select option that belongs to an organization (for optgroup grouping). */
    public record GroupedOption(UUID id, String label, UUID organizationId) {
    }

    // ------------------------------------------------------------- Categories

    public static final class CategoryCreateForm {

        @NotBlank(message = "Organization is required.")
        private String organizationId;

        @NotBlank(message = "Name is required.")
        @Size(max = 120, message = "Name must be at most 120 characters.")
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

    public static final class CategoryEditForm {

        @NotBlank(message = "Name is required.")
        @Size(max = 120, message = "Name must be at most 120 characters.")
        private String name;

        public CategoryEditForm() {
        }

        public CategoryEditForm(String name) {
            this.name = name;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }

    // ----------------------------------------------------------------- Skills

    public static final class SkillCreateForm {

        @NotBlank(message = "Organization is required.")
        private String organizationId;

        @NotBlank(message = "Category is required.")
        private String categoryId;

        @NotBlank(message = "Name is required.")
        @Size(max = 160, message = "Name must be at most 160 characters.")
        private String name;

        @Size(max = 4000, message = "Description must be at most 4000 characters.")
        private String description;

        @NotBlank(message = "Author is required.")
        private String authorId;

        private List<String> departmentIds = new ArrayList<>();

        public String getOrganizationId() {
            return organizationId;
        }

        public void setOrganizationId(String organizationId) {
            this.organizationId = organizationId;
        }

        public String getCategoryId() {
            return categoryId;
        }

        public void setCategoryId(String categoryId) {
            this.categoryId = categoryId;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public String getAuthorId() {
            return authorId;
        }

        public void setAuthorId(String authorId) {
            this.authorId = authorId;
        }

        public List<String> getDepartmentIds() {
            return departmentIds;
        }

        public void setDepartmentIds(List<String> departmentIds) {
            this.departmentIds = departmentIds == null ? new ArrayList<>() : departmentIds;
        }
    }

    public static final class SkillEditForm {

        @NotBlank(message = "Category is required.")
        private String categoryId;

        @NotBlank(message = "Name is required.")
        @Size(max = 160, message = "Name must be at most 160 characters.")
        private String name;

        @Size(max = 4000, message = "Description must be at most 4000 characters.")
        private String description;

        private List<String> departmentIds = new ArrayList<>();

        public String getCategoryId() {
            return categoryId;
        }

        public void setCategoryId(String categoryId) {
            this.categoryId = categoryId;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public List<String> getDepartmentIds() {
            return departmentIds;
        }

        public void setDepartmentIds(List<String> departmentIds) {
            this.departmentIds = departmentIds == null ? new ArrayList<>() : departmentIds;
        }
    }
}
