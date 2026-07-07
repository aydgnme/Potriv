package me.aydgn.potriv.security.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import me.aydgn.potriv.security.entity.SecurityAuditEvent;

public interface SecurityAuditEventRepository
    extends JpaRepository<SecurityAuditEvent, UUID>, JpaSpecificationExecutor<SecurityAuditEvent> {
}
