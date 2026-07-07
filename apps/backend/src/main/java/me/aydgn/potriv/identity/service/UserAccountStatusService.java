package me.aydgn.potriv.identity.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentUserProvider;
import me.aydgn.potriv.identity.dto.UserStatusResponse;
import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;

@Service
public class UserAccountStatusService {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final UserSessionService userSessionService;
    private final CurrentUserProvider currentUserProvider;

    public UserAccountStatusService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        UserSessionService userSessionService,
        CurrentUserProvider currentUserProvider
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.userSessionService = userSessionService;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public UserStatusResponse changeStatus(UUID userId, AccessAccountStatus newStatus) {
        AuthenticatedUser actor = currentUserProvider.getCurrentUser();

        User target = userRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("User was not found."));

        if (newStatus != AccessAccountStatus.ACTIVE) {
            if (target.getId().equals(actor.userId())) {
                throw new BadRequestException(
                    "You cannot suspend or disable your own account."
                );
            }

            ensureNotLastActiveSystemAdmin(target);
        }

        target.changeStatus(newStatus);

        if (newStatus != AccessAccountStatus.ACTIVE) {
            userSessionService.revokeAllSessionsForUser(target.getId());
        }

        return new UserStatusResponse(target.getId(), target.getStatus());
    }

    private void ensureNotLastActiveSystemAdmin(User target) {
        if (!userRoleRepository.existsByUserAndRole(target, AccessRole.SYSTEM_ADMIN)) {
            return;
        }

        long otherActiveSystemAdmins = userRoleRepository
            .countByRoleAndUser_StatusAndUser_IdNot(
                AccessRole.SYSTEM_ADMIN,
                AccessAccountStatus.ACTIVE,
                target.getId()
            );

        if (otherActiveSystemAdmins == 0) {
            throw new BadRequestException(
                "The last active system administrator cannot be suspended or disabled."
            );
        }
    }
}
