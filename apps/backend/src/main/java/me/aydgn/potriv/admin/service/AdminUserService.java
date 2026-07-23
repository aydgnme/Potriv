package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminUserRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminUserViews;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;

@Service
public class AdminUserService {

    private final AdminUserRepository userRepository;
    private final UserRoleRepository userRoleRepository;

    public AdminUserService(
        AdminUserRepository userRepository, UserRoleRepository userRoleRepository) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminUserViews.ListItem> list(
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<User> page = userRepository.search(AdminPaging.likePattern(q), pageable);

        List<UUID> ids = page.getContent().stream().map(User::getId).toList();
        Map<UUID, List<String>> rolesByUser = rolesByUser(ids);

        Page<AdminUserViews.ListItem> mapped = page.map(user -> new AdminUserViews.ListItem(
            user.getId(),
            user.getName(),
            user.getEmail(),
            organizationName(user.getOrganization()),
            rolesByUser.getOrDefault(user.getId(), List.of()),
            user.getStatus().name(),
            user.getCreatedAt(),
            user.getUpdatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminUserViews.Details details(UUID id) {
        User user = userRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("User was not found."));
        List<String> roles = rolesByUser(List.of(id)).getOrDefault(id, List.of());
        Organization organization = user.getOrganization();
        return new AdminUserViews.Details(
            user.getId(),
            user.getName(),
            user.getEmail(),
            organizationName(organization),
            organization == null ? null : organization.getId(),
            roles,
            user.getStatus().name(),
            organization == null,
            user.getCreatedAt(),
            user.getUpdatedAt());
    }

    private Map<UUID, List<String>> rolesByUser(List<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return userRoleRepository.findByUser_IdIn(userIds).stream()
            .collect(Collectors.groupingBy(
                role -> role.getUser().getId(),
                Collectors.mapping(
                    (UserRole role) -> role.getRole().name(),
                    Collectors.collectingAndThen(Collectors.toList(), roles -> {
                        roles.sort(String::compareTo);
                        return roles;
                    }))));
    }

    private static String organizationName(Organization organization) {
        return organization == null ? "—" : organization.getName();
    }
}
