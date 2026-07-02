package me.aydgn.potriv.organization.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.organization.entity.Organization;


public interface OrganizationRepository extends JpaRepository<Organization, UUID> {
}
