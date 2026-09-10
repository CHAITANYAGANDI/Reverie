package com.reverie.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One lifetime free allowance, and how much of it is gone.
 *
 * <p>Not owned by an account, which is the whole point. `usage_limits` is
 * `ON DELETE CASCADE` from `users`, so closing an account took its counters
 * with it and signing up again started at zero — the free tier reset by
 * deleting and re-creating. This row has no `user_id` and nothing cascades to
 * it; `users.free_tier_entitlement_id` points at it from the other side. See
 * V69.
 *
 * <p>Holds two numbers and two timestamps. No email, no name, no content, and
 * no reference to any of it: after the account is gone, this says "one free
 * allowance, this much of it spent" and nothing else. What connects it back to
 * a person is a keyed hash in `free_tier_identities` — see
 * {@link com.reverie.service.FreeTierIdentityHasher}.
 *
 * <p><b>Read here, written by SQL.</b> The counters are incremented by
 * conditional statements in
 * {@link com.reverie.repository.FreeTierEntitlementRepository} rather than by
 * dirty-checking these fields, because two concurrent imports that both read 2
 * and both write 3 spend one allowance twice. The setters exist for tests and
 * for the seeding path; nothing on the charging path uses them.
 */
@Entity
@Table(name = "free_tier_entitlements")
public class FreeTierEntitlement {

    @Id
    private String id;

    /**
     * Whole minutes of transcription charged, ever.
     *
     * <p>Minutes rather than seconds because that is the unit the pipeline
     * charges in: a completed run reports whole minutes, rounded up, and
     * `MINUTES_ALLOWANCE` is 100 of them. Storing seconds would be a truer unit
     * and a silent change to the rounding.
     */
    @Column(name = "recording_minutes_used", nullable = false)
    private int recordingMinutesUsed = 0;

    /** Files imported, ever. A browser recording is not one. */
    @Column(name = "imports_used", nullable = false)
    private int importsUsed = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public int getRecordingMinutesUsed() { return recordingMinutesUsed; }
    public void setRecordingMinutesUsed(int minutes) { this.recordingMinutesUsed = minutes; }

    public int getImportsUsed() { return importsUsed; }
    public void setImportsUsed(int importsUsed) { this.importsUsed = importsUsed; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
