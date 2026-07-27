package me.aydgn.potriv.admin.support;

import java.util.UUID;

/**
 * Parses ids submitted from admin form selects. A blank or malformed value
 * becomes an {@link AdminValidationException} on the given field so the form
 * re-renders with a field error instead of throwing a raw conversion error.
 */
public final class AdminIds {

    private AdminIds() {
    }

    public static UUID parse(String raw, String field, String requiredMessage) {
        if (raw == null || raw.isBlank()) {
            throw new AdminValidationException(field, requiredMessage);
        }
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException ex) {
            throw new AdminValidationException(field, "Please select a valid value.");
        }
    }
}
