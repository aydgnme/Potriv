package me.aydgn.potriv.common.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import me.aydgn.potriv.common.exception.BadRequestException;

@Component
public class CurrentUserProvider {

    public AuthenticatedUser getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
            throw new BadRequestException("Authenticated user context is missing.");
        }

        return user;
    }
}