package com.reverie.repository;

import com.reverie.entity.FreeTierIdentity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Which verified identities have already had the free allowance.
 *
 * <p>Read by hash, never by address: the address is not here. See
 * {@link com.reverie.service.FreeTierIdentityHasher}.
 */
public interface FreeTierIdentityRepository extends JpaRepository<FreeTierIdentity, String> {

    Optional<FreeTierIdentity> findByIdentityHash(String identityHash);

    /** Every address that has ever been the verified identity of one allowance. */
    List<FreeTierIdentity> findByEntitlementId(String entitlementId);

    /**
     * Claim an identity for an entitlement, or leave the claim that exists.
     *
     * <p>The primary key does the deciding, in Postgres, which is the only
     * place it can be decided safely. A browser opening the app for the first
     * time fires several requests at once and every one of them provisions the
     * same brand-new identity: read-then-insert gives all of them an empty
     * lookup, so all of them insert, and the losers either fail the request or
     * — much worse — create a second entitlement and a second allowance.
     *
     * <p>{@code DO NOTHING} rather than {@code DO UPDATE}, deliberately. If a
     * hash is already mapped, the existing mapping wins and the caller reads
     * it: an identity's allowance can never be re-pointed at a different
     * entitlement by anything that merely provisions. That is what makes the
     * email-collision case safe rather than a way to inherit somebody's
     * unspent minutes.
     *
     * @return 1 when this caller created the mapping, 0 when it already existed
     */
    @Modifying
    @Query(value = """
            INSERT INTO free_tier_identities
                (identity_hash, hash_version, entitlement_id)
            VALUES (:hash, :version, :entitlementId)
            ON CONFLICT (identity_hash) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("hash") String hash,
                       @Param("version") short version,
                       @Param("entitlementId") String entitlementId);
}
