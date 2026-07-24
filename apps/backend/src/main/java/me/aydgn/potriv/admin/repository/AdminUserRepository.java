package me.aydgn.potriv.admin.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.identity.entity.User;

/**
 * Read-only, paged admin queries over users. Search is applied in the database
 * (never findAll-then-filter); the organization to-one is fetch-joined to avoid
 * N+1 in listings.
 */
public interface AdminUserRepository extends Repository<User, UUID> {

    @Query(value = "select u from User u left join fetch u.organization "
        + "where lower(u.name) like :pattern or lower(u.email) like :pattern",
        countQuery = "select count(u) from User u "
            + "where lower(u.name) like :pattern or lower(u.email) like :pattern")
    Page<User> search(@Param("pattern") String pattern, Pageable pageable);

    @Query("select u from User u left join fetch u.organization where u.id = :id")
    Optional<User> findDetailById(@Param("id") UUID id);
}
