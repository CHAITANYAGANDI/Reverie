package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.common.IdGenerator;
import com.reverie.domain.Plan;
import com.reverie.dto.UsageResponse;
import com.reverie.entity.UsageLimit;
import com.reverie.repository.FreeTierEntitlementRepository;
import com.reverie.repository.MeetingUsageChargeRepository;
import com.reverie.repository.UsageLimitRepository;
import com.reverie.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What an account is allowed, and how much of it is gone.
 *
 * <p>One allowance, for the life of the account: {@value #MINUTES_ALLOWANCE}
 * transcribed minutes and {@value #IMPORT_ALLOWANCE} imported files. Not per
 * month — there is no rollover, no reset date and nothing to wait for.
 *
 * <p><b>Why minutes rather than meetings.</b> The old ceiling was five meetings
 * a calendar month, which charged the same for a two-minute voice note and a
 * ninety-minute workshop. Minutes are what a transcript actually costs to
 * produce, so they are what is counted; the number of recordings is still
 * tallied for the figure in the rail, and nothing refuses one for being the
 * eleventh.
 *
 * <p><b>Why imports are capped separately.</b> A recording is made in the
 * browser, in real time, by somebody sitting there — an hour of it costs an hour
 * of their day. An import is a file, and a folder of files is an afternoon of
 * someone else's archive arriving at once. The minute allowance would stop that
 * eventually; three imports stops it at the point where it is still obvious what
 * the product is for.
 *
 * <p><b>When each is charged.</b> Both at confirmation, in
 * {@link #chargeMeetingOrThrow}, so an upload somebody abandons is free. The
 * minutes themselves are added later by {@link #addAiMinutes}, when processing
 * finishes and the true duration is known.
 *
 * <p><b>Neither can overrun.</b> A meeting is refused if its length will not
 * fit in what is left, whether it was recorded here or imported. For an import
 * that is easy: the file is on the user's disk and nothing is lost by saying no.
 *
 * <p>For a recording it is only safe because the browser does not let one reach
 * this point. `lib/allowance.ts` refuses to start a recording with no balance
 * and stops one that reaches the edge of it, so what arrives here always fits.
 * This check is the authority rather than the mechanism — it is what makes
 * the limit real for a client that did not do that, and the reason the client
 * fails closed when it cannot read the balance. Enforcing it here *alone* would
 * mean the only way to hold the line against a recording is to destroy a
 * meeting somebody sat through, which is why the two halves exist together.
 *
 * <p><b>Where the numbers live, and why it is not one table.</b> The two
 * capped figures — minutes and imports — are on {@code free_tier_entitlements},
 * which no account owns and no cascade reaches. {@code usage_limits} keeps
 * {@code meetings_used}, which is a per-account tally rather than a limit: a
 * new account genuinely has no meetings, and it is only ever shown as a figure.
 *
 * <p>That split is the fix for a real bypass. {@code usage_limits} is
 * {@code ON DELETE CASCADE} from {@code users}, so "for the life of the
 * account" meant "for the life of the row": closing an account and signing up
 * again with the same address handed out another 100 minutes and another three
 * imports, indefinitely. See {@link FreeTierService} and V69.
 *
 * <p><b>Both capped counters are now written by SQL that carries its own
 * arithmetic</b> rather than by dirty-checking an entity, which closes the
 * other half of the same problem: two imports confirmed in the same instant
 * both read "2 used" and both wrote 3, spending one free import twice. See
 * {@link com.reverie.repository.FreeTierEntitlementRepository}.
 *
 * <p>{@link RateLimitService} is a different thing and still separate: it is
 * requests per minute, to stop a loop, not an allowance.
 */
@Service
public class UsageLimitService {

    private final AccountMail mail;

    /** Transcribed minutes an account gets, ever. */
    public static final int MINUTES_ALLOWANCE = 100;

    /** Files an account may import, ever. A browser recording is not one. */
    public static final int IMPORT_ALLOWANCE = 3;

    private static final Logger log = LoggerFactory.getLogger(UsageLimitService.class);

    private final UsageLimitRepository usage;
    private final UserRepository users;
    private final MeetingUsageChargeRepository charges;
    private final FreeTierEntitlementRepository entitlements;
    private final FreeTierService freeTier;

    public UsageLimitService(UsageLimitRepository usage, UserRepository users,
                             MeetingUsageChargeRepository charges,
                             FreeTierEntitlementRepository entitlements,
                             FreeTierService freeTier,
                             AccountMail mail) {
        this.usage = usage;
        this.users = users;
        this.charges = charges;
        this.entitlements = entitlements;
        this.freeTier = freeTier;
        this.mail = mail;
    }

    /**
     * What this account has spent of its lifetime allowance.
     *
     * <p>Zeroes rather than a throw if the row cannot be read. Unreachable —
     * provisioning links every account before it can reach any of this — and a
     * refusal here would mean a recording somebody has already made cannot be
     * saved, which is a worse failure than a balance read as untouched.
     */
    private Spent spent(String userId) {
        String id = freeTier.forAccount(userId);
        return freeTier.read(id)
                .map(e -> new Spent(id, e.getRecordingMinutesUsed(), e.getImportsUsed()))
                .orElseGet(() -> new Spent(id, 0, 0));
    }

    /** One entitlement's two counters, read together. */
    private record Spent(String entitlementId, int minutes, int imports) {
    }

    /**
     * Say something about the balance, once, at each of two points.
     *
     * <p>Here rather than at the call sites because this is the only method
     * that knows the number changed, and a threshold checked in some of the
     * places minutes are spent and not others is a warning that arrives for
     * some accounts and not others.
     *
     * <p>Inside the transaction that spent the minutes. That is not the same as
     * sending inside it: what is written here is the intent, in the same commit
     * as the balance it describes. A rollback takes both, so the message can
     * never claim a balance that was never spent, and a provider outage delays
     * it rather than losing it.
     */
    private void announceBalance(String userId, int used) {
        mail.allowance(userId, used, MINUTES_ALLOWANCE);
    }

    private Plan planOf(String userId) {
        return users.findById(userId).map(u -> Plan.fromString(u.getPlan())).orElse(Plan.FREE);
    }

    /**
     * The account's counter, created empty the first time it is needed.
     *
     * <p>Lazily rather than at signup, so an account that never records anything
     * never has a row — and so this cannot be forgotten in whichever of the
     * three places accounts come into being.
     */
    @Transactional
    public UsageLimit forUser(String userId) {
        return usage.findByUserId(userId).orElseGet(() -> {
            UsageLimit u = new UsageLimit();
            u.setId(IdGenerator.usage());
            u.setUserId(userId);
            return usage.save(u);
        });
    }

    /**
     * The balance, as the Usage panel shows it.
     *
     * <p>The two capped figures come from the lifetime entitlement, so an
     * account recreated by somebody who has been here before opens showing what
     * they actually have left rather than a full allowance that their first
     * upload would contradict.
     *
     * <p>No longer {@code readOnly}: resolving the entitlement may attach one
     * for an account provisioned before V69. That is one write, on the first
     * read after the deploy, and the alternative is a panel showing an
     * untouched allowance for an account whose usage is sitting in the old
     * table.
     */
    @Transactional
    public UsageResponse getUsage(String userId) {
        Plan plan = planOf(userId);
        Spent s = spent(userId);
        // Read rather than created: a GET that writes a row is a GET that fails
        // on a read-only replica and creates rows for anybody who opens the app.
        UsageLimit u = usage.findByUserId(userId).orElse(null);
        return new UsageResponse(
                plan.name(),
                s.minutes(),
                MINUTES_ALLOWANCE,
                s.imports(),
                IMPORT_ALLOWANCE,
                u == null ? 0 : u.getMeetingsUsed());
    }

    /**
     * Charge a meeting against the allowance, or refuse it.
     *
     * @param recordedHere   made in the browser rather than imported
     * @param durationSeconds how long the client says it is, or null if unknown
     */
    @Transactional
    public void chargeMeetingOrThrow(String userId, boolean recordedHere, Integer durationSeconds) {
        UsageLimit u = forUser(userId);
        Spent s = spent(userId);

        int left = Math.max(0, MINUTES_ALLOWANCE - s.minutes());

        if (!recordedHere && s.imports() >= IMPORT_ALLOWANCE) {
            // "Recording still works" only when it does. Somebody who is out of
            // imports *and* out of minutes is out, and telling them to go and
            // record instead sends them to a second refusal -- which reads as
            // the product being broken rather than the account being spent.
            throw ApiException.usageLimitReached(
                    "You have used all " + IMPORT_ALLOWANCE + " imports on this account."
                            + (left > 0 ? " Recording in the browser still works." : ""));
        }

        if (left == 0) {
            throw ApiException.usageLimitReached(
                    "You have used all " + MINUTES_ALLOWANCE
                            + " transcription minutes on this account.");
        }
        // Measured against the balance whichever way it arrived. A recording
        // used to be exempt, because refusing one at save time destroys audio
        // somebody sat through -- but that exemption *was* the overrun, and the
        // limit is meant to be final. It is safe now because the recorder stops
        // itself at the balance (lib/allowance.ts), so a recording that reaches
        // here already fits and this only fires for a client that ignored it.
        if (durationSeconds != null && durationSeconds > 0) {
            // Rounded up: a 61-second clip spends two minutes of the allowance,
            // because the alternative is a file that fits by arithmetic and does
            // not fit by the time it has been transcribed.
            int wanted = (int) Math.ceil(durationSeconds / 60.0);
            if (wanted > left) {
                throw ApiException.usageLimitReached(
                        "That is " + wanted + " minutes and you have " + left
                                + " left of your " + MINUTES_ALLOWANCE + ".");
            }
        }

        if (!recordedHere) {
            /*
             * THE IMPORT IS CLAIMED, NOT COUNTED.
             *
             * <p>The check above exists for the message; this is the decision.
             * It is one statement whose WHERE clause carries the limit, so two
             * imports confirmed in the same instant against a balance of one
             * end with one refused — where a read-modify-write let both read
             * "2 used" and both write 3, spending the last free import twice.
             *
             * <p>Which means the refusal can also happen here, having passed
             * the check a moment ago. Same sentence either way: what somebody
             * needs to be told is that the imports are gone, not that they lost
             * a race.
             */
            if (entitlements.claimImport(s.entitlementId(), IMPORT_ALLOWANCE) == 0) {
                throw ApiException.usageLimitReached(
                        "You have used all " + IMPORT_ALLOWANCE + " imports on this account."
                                + (left > 0 ? " Recording in the browser still works." : ""));
            }
        }
        // After the claim, because a meeting refused for having no import left
        // is not a meeting and must not appear in the tally as one.
        u.setMeetingsUsed(u.getMeetingsUsed() + 1);
    }

    /**
     * Everything that asks a model, and what to call it when it is refused.
     *
     * <p>An enum rather than a string per call site so the refusals cannot drift
     * apart: five features saying the same thing five slightly different ways
     * reads as five different problems. Each clause finishes the sentence begun
     * in {@link #requireAiOrThrow}.
     *
     * <p>Every one of them names what is <em>kept</em> as well as what is
     * refused. Running out of an allowance is not the account being closed, and
     * a refusal that does not say so is read as one.
     */
    public enum AiFeature {
        CHAT("AI Chat is closed",
                "Your meetings and the answers you already have are still here."),
        RESUMMARIZE("the summary cannot be rewritten",
                "The summary you have is still here."),
        TRANSLATION("nothing further can be translated",
                "Translations you already have are still here."),
        REPROCESS("meetings cannot be reprocessed",
                "Everything already transcribed is still here.");

        private final String refused;
        private final String kept;

        AiFeature(String refused, String kept) {
            this.refused = refused;
            this.kept = kept;
        }
    }

    /**
     * Refuse anything that asks a model, once the minutes are gone.
     *
     * <p><b>Most of these spend no transcription minutes at all.</b> Chat spends
     * context and a completion; rewriting a summary re-reads a transcript
     * already paid for. On the arithmetic alone they could
     * run forever on an account that can no longer record. They do not, and the
     * reason is what the allowance is for rather than what it counts: 100
     * minutes is the whole of what an account gets, and AI features still
     * running afterwards would make it a limit on recording rather than on the
     * product.
     *
     * <p>Reprocessing is the exception that proves it — that one really does
     * re-transcribe the audio and really is charged again when it lands.
     *
     * <p><b>Reads are left alone.</b> Somebody out of minutes keeps every
     * conversation they have had, every summary, every translation and every
     * name they typed. This declines to do more work; it does not take away
     * work already done, and each refusal below says which of the two it is.
     */
    @Transactional
    public void requireAiOrThrow(String userId, AiFeature feature) {
        int used = spent(userId).minutes();
        if (used >= MINUTES_ALLOWANCE) {
            throw ApiException.usageLimitReached(
                    "You have used all " + MINUTES_ALLOWANCE
                            + " transcription minutes on this account, so "
                            + feature.refused + ". " + feature.kept);
        }
    }

    /**
     * Spend minutes, once a meeting has finished and the real length is known.
     *
     * <p>Not clamped to the allowance. A meeting that overruns what was left
     * finishes and is kept — refusing to store a transcript already paid for
     * would be destroying work to defend a number — and the account is simply
     * past its allowance afterwards, which the next request finds.
     */
    @Transactional
    public void addAiMinutes(String userId, int minutes) {
        Spent s = spent(userId);
        int billed = Math.max(0, minutes);
        entitlements.addMinutes(s.entitlementId(), billed);
        announceBalance(userId, s.minutes() + billed);
    }

    /**
     * Charge one processing attempt, once, however many times it is reported.
     *
     * <p>{@link #addAiMinutes} is a read-modify-write accumulator, which was
     * correct while a completed run was reported exactly once and became a
     * quota leak the moment Kafka delivery was allowed to redeliver. The guard
     * is the primary key of {@code meeting_usage_charges}, not a check here:
     * two duplicate callbacks in flight together would both pass an existence
     * check, and only one can win an insert.
     *
     * <p>A genuine reprocess arrives with a higher attempt number and is
     * charged, which is the behaviour that existed before this and is
     * deliberately kept — the allowance is for minutes transcribed, and
     * reprocessing transcribes them again.
     *
     * @return true when this call charged, false when the attempt was already
     *         billed and nothing was added.
     */
    @Transactional
    public boolean chargeAiMinutesOnce(String userId, String meetingId, int attempt, int minutes) {
        int billed = Math.max(0, minutes);
        if (charges.claim(meetingId, attempt, userId, billed) == 0) {
            log.debug("Attempt {} of meeting {} was already charged; adding nothing.", attempt, meetingId);
            return false;
        }
        Spent s = spent(userId);
        // One statement, so two meetings finishing together cannot lose one of
        // the two charges — the same lost update as the import race, in the
        // direction that quietly hands minutes back.
        entitlements.addMinutes(s.entitlementId(), billed);
        announceBalance(userId, s.minutes() + billed);
        return true;
    }
}
