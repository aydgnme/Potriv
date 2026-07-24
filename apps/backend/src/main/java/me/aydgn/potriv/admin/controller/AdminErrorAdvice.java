package me.aydgn.potriv.admin.controller;

import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;

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

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public String handleUnexpected() {
        return "admin/error/500";
    }
}
