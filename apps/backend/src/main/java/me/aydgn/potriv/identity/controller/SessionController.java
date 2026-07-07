package me.aydgn.potriv.identity.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.dto.SessionResponse;
import me.aydgn.potriv.identity.service.UserSessionService;

@RestController
@RequestMapping("/auth")
public class SessionController {

    private final UserSessionService userSessionService;

    public SessionController(UserSessionService userSessionService) {
        this.userSessionService = userSessionService;
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        userSessionService.revokeCurrentSession(authenticatedUser);
    }

    @PostMapping("/logout-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logoutAll(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        userSessionService.revokeAllSessions(authenticatedUser);
    }

    @GetMapping("/sessions")
    public List<SessionResponse> listSessions(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return userSessionService.listSessions(authenticatedUser);
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeSession(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID sessionId
    ) {
        userSessionService.revokeOwnedSession(authenticatedUser, sessionId);
    }
}
