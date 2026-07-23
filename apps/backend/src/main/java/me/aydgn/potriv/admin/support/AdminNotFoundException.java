package me.aydgn.potriv.admin.support;

/**
 * Signals a missing admin resource (unknown id, or the console being disabled).
 * Intentionally distinct from the domain {@code NotFoundException} so the
 * REST {@code GlobalExceptionHandler} never renders it as JSON — the admin
 * error advice turns it into an HTML 404 instead.
 */
public class AdminNotFoundException extends RuntimeException {

    public AdminNotFoundException(String message) {
        super(message);
    }
}
