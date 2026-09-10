package com.reverie.repository;

import com.reverie.entity.FreeTierEntitlement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The lifetime allowance, incremented in single statements.
 *
 * <h2>Why none of this is a setter</h2>
 *
 * <p>The counters used to be read-modify-write on a managed entity: read
 * {@code imports_used}, add one, let Hibernate flush it. Under READ COMMITTED
 * two requests that arrive together both read 2, both write 3, and one free
 * import has been spent twice. The completion callback had the mirror image of
 * the same bug: two meetings finishing at the same instant both read the minute
 * total and one of the two charges was simply lost, which is over-consumption
 * of the allowance in the user's favour and just as wrong.
 *
 * <p>Every write below is therefore one {@code UPDATE} that carries its own
 * arithmetic, and where there is a limit it carries that too in the
 * {@code WHERE}. Postgres serialises the two statements on the row, so the
 * second one is evaluated against what the first left behind: the loser of a
 * claim matches nothing and is refused, and neither of two increments can
 * overwrite the other. No locking to remember and no window between the check
 * and the charge.
 *
 * <h2>When each is used, and why they are not symmetrical</h2>
 *
 * <p>This mirrors the existing product rule rather than introducing one. An
 * import is a discrete thing charged at the moment a meeting is confirmed, so
 * it is claimed conditionally — {@link #claimImport} is the check and the
 * charge in one statement. Minutes are charged later, by the completion
 * callback, when the true length of the recording is known; that charge is
 * unconditional ({@link #addMinutes}) because by then the transcript exists,
 * and refusing it would mean destroying work already done to defend a number.
 * See `UsageLimitService` for the whole of that reasoning, which predates this
 * table.
 */
public interface FreeTierEntitlementRepository extends JpaRepository<FreeTierEntitlement, String> {

    /**
     * Create the allowance with the usage it starts from, or leave the one that
     * is already there.
     *
     * <p>Insert-with-values rather than {@code save} so that creating the row
     * and seeding an existing account's consumed usage are one statement. The
     * backfill has numbers to carry over — see `FreeTierService` — and a
     * create-then-update could be interrupted between the two and leave
     * somebody at zero, which is the reset this whole change exists to prevent.
     *
     * @return 1 when this caller created the row, 0 when the id already existed
     */
    @Modifying
    @Query(value = """
            INSERT INTO free_tier_entitlements
                (id, recording_minutes_used, imports_used)
            VALUES (:id, :minutes, :imports)
            ON CONFLICT (id) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") String id,
                       @Param("minutes") int minutes,
                       @Param("imports") int imports);

    /**
     * Spend one import, if there is one left.
     *
     * <p>The condition is inside the statement, which is what makes two
     * simultaneous imports against a balance of one end with one refused
     * rather than both accepted.
     *
     * @return 1 when the import was charged, 0 when the allowance is spent
     */
    @Modifying
    @Query(value = """
            UPDATE free_tier_entitlements
               SET imports_used = imports_used + 1,
                   updated_at = now()
             WHERE id = :id
               AND imports_used < :limit
            """, nativeQuery = true)
    int claimImport(@Param("id") String id, @Param("limit") int limit);

    /**
     * Charge minutes that have already been transcribed.
     *
     * <p>Unconditional and not clamped to the allowance: this is the point at
     * which the work exists. An account that overruns what was left is simply
     * past its allowance afterwards, which the next request finds. Called only
     * from behind the {@code meeting_usage_charges} primary key, so a
     * redelivered callback adds nothing.
     */
    @Modifying
    @Query(value = """
            UPDATE free_tier_entitlements
               SET recording_minutes_used = recording_minutes_used + :minutes,
                   updated_at = now()
             WHERE id = :id
            """, nativeQuery = true)
    int addMinutes(@Param("id") String id, @Param("minutes") int minutes);
}
