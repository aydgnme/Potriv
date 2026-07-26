package me.aydgn.potriv.admin.support;

/**
 * Signals a business-rule violation while processing an admin write form (for
 * example a duplicate name or a vanished organization). Carries an optional
 * form field name so the controller can attach the error to that field and
 * re-render the form; a {@code null} field becomes a global form error.
 *
 * <p>Controllers always catch this before it can reach {@link
 * me.aydgn.potriv.admin.controller.AdminErrorAdvice}, so it never becomes a 500.
 */
public class AdminValidationException extends RuntimeException {

    private final String field;

    public AdminValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    /** The form field to attach the error to, or {@code null} for a global error. */
    public String field() {
        return field;
    }
}
