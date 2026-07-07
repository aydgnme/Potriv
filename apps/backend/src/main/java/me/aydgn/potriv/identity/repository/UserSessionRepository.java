package me.aydgn.potriv.identity.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.identity.entity.UserSession;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {
}
