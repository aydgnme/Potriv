package me.aydgn.potriv.identity.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;


@Component
public class SystemAdminSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.system-admin.email}")
    private String email;

    @Value("${app.system-admin.password}")
    private String password;

    @Value("${app.system-admin.name}")
    private String name;

    public SystemAdminSeeder(UserRepository userRepository, UserRoleRepository userRoleRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (userRepository.existsByEmail(email)) {
            return;
        }

        User systemAdmin = new User(
            null,
            name,
            email,
            passwordEncoder.encode(password)
        );

        userRepository.save(systemAdmin);

        UserRole role = new UserRole(systemAdmin, AccessRole.SYSTEM_ADMIN);
        userRoleRepository.save(role);
    }

}
