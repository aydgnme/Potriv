package me.aydgn.potriv.admin.controller;

import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import me.aydgn.potriv.admin.support.AdminNotFoundException;

/**
 * Admin-scoped error handling. Restricted to the admin controller package so it
 * never interferes with the REST API's JSON error responses. Renders the admin
 * visual language and never leaks stack traces.
 */
@ControllerAdvice(basePackages = "me.aydgn.potriv.admin.controller")
@Order(0)
public class AdminErrorAdvice {

    @ExceptionHandler(AdminNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public String handleNotFound() {
        return "admin/error/404";
    }

    /**
     * A request value that will not convert to the handler's parameter type —
     * in practice a malformed id such as {@code /admin/users/not-a-uuid}.
     *
     * <p>Without this it falls through to the {@code Exception} handler below and
     * renders a 500, telling an operator the console broke when they had only
     * mistyped a link. Answering with the same 404 an unknown id produces is both
     * the truthful outcome and the one that discloses least.
     *
     * <p>Deliberately narrow: only Spring's parameter-binding failure is mapped.
     * A conversion error raised deeper in the stack is a real defect and must
     * keep surfacing as a 500.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public String handleUnreadableRequestValue() {
        return "admin/error/404";
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public String handleUnexpected() {
        return "admin/error/500";
    }
}
