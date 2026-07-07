package me.aydgn.potriv.identity.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.identity.entity.UserSession;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    List<UserSession> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<UserSession> findByIdAndUserId(UUID id, UUID userId);
}
