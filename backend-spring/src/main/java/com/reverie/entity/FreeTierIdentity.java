package com.reverie.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A verified identity that has already been granted the free allowance.
 *
 * <p>The primary key is a keyed hash, not an address —
 * {@code HMAC-SHA-256(lower(trim(email)), secret)}. There is no column holding
 * the address it was made from and no way to get back to one without the key,
 * which is not in the database. See
 * {@link com.reverie.service.FreeTierIdentityHasher}.
 *
 * <p><b>Many of these may point at one entitlement.</b> That is what makes an
 * email change not a second free tier: when a verified primary address moves
 * from A to B, B is written as another identity of the *same* entitlement, so
 * the usage follows the person rather than the address. Moving back to A finds
 * A's row still there and pointing at the same place.
 *
 * <p>The row outlives the account it was created for. It is the only thing
 * about a closed account that Reverie keeps, and it holds nothing that could
 * restore one: no content, no profile, not even the address.
 */
@Entity
@Table(name = "free_tier_identities")
public class FreeTierIdentity {

    /** {@code HMAC-SHA-256(normalised verified email, server secret)}, hex. */
    @Id
    @Column(name = "identity_hash", nullable = false)
    private String identityHash;

    /**
     * Which secret produced {@link #identityHash}.
     *
     * <p>Nothing rotates the key today. The column exists so that rotating it
     * can be additive later — match either version — instead of leaving a table
     * of hashes that no live code can reproduce.
     */
    @Column(name = "hash_version", nullable = false)
    private short hashVersion;

    @Column(name = "entitlement_id", nullable = false)
    private String entitlementId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public String getIdentityHash() { return identityHash; }
    public void setIdentityHash(String identityHash) { this.identityHash = identityHash; }

    public short getHashVersion() { return hashVersion; }
    public void setHashVersion(short hashVersion) { this.hashVersion = hashVersion; }

    public String getEntitlementId() { return entitlementId; }
    public void setEntitlementId(String entitlementId) { this.entitlementId = entitlementId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
