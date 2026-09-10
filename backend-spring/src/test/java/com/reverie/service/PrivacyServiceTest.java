package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.dto.PrivacyOverviewResponse;
import com.reverie.entity.Meeting;
import com.reverie.entity.UserEntity;
import com.reverie.repository.ChatConversationRepository;
import com.reverie.repository.MeetingActionItemRepository;
import com.reverie.repository.MeetingRepository;
import com.reverie.repository.ProjectRepository;
import com.reverie.repository.TranscriptMomentRepository;
import com.reverie.repository.UserRepository;
import com.reverie.security.TenantContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

/**
 * The page that has to be true.
 *
 * <p>Two things are being tested here and they pull in opposite directions.
 * One is that the page reports reality rather than intentions — most sharply
 * that "encrypted storage" comes back from the object store and is allowed to
 * say no. The other is that the irreversible button is hard to press by
 * accident and does exactly what it says once pressed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PrivacyServiceTest {

    private static final String USER = "usr_1";
    private static final LocalDate TODAY = LocalDate.of(2026, 8, 16);

    @Mock private MeetingRepository meetings;
    @Mock private MeetingActionItemRepository actionItems;
    @Mock private TranscriptMomentRepository moments;
    @Mock private ProjectRepository projects;
    @Mock private ChatConversationRepository conversations;
    @Mock private UserRepository users;
    @Mock private RetentionService retention;
    @Mock private ErasureService erasure;
    @Mock private StorageService storage;
    @Mock private AuditService audit;
    @Mock private AccountMail mail;
    /**
     * The lifetime free allowance, which has one thing to say about deletion.
     *
     * <p>Closing an account removes the only link between the allowance and a
     * person unless an identity mapping already names it — so the current
     * verified address is confirmed with Clerk and aliased first. See
     * `FreeTierService.bindCurrentIdentityBeforeDeletion`, which owns the
     * decision; what is asserted here is the ordering.
     */
    @Mock private FreeTierService freeTier;

    private PrivacyService service;
    private UserEntity user;

    @BeforeEach
    void setUp() {
        service = new PrivacyService(meetings, actionItems, moments, projects, conversations,
                users, retention, erasure, storage, audit, mail, freeTier,
                "https://reverie.test/");
        user = new UserEntity();
        user.setId(USER);
        user.setClerkUserId("user_2clerk");
        when(users.findById(USER)).thenReturn(Optional.of(user));
        when(meetings.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of());
        when(retention.preview(anyString(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new RetentionService.Due(0, 0));
        when(storage.encryptionAtRest()).thenReturn(Optional.empty());
        when(storage.presignExpirySeconds()).thenReturn(900L);
    }

    private static Meeting meeting(String id, String title) {
        Meeting meeting = new Meeting();
        meeting.setId(id);
        meeting.setUserId(USER);
        meeting.setTitle(title);
        meeting.setObjectKey("meetings/usr_1/" + id + "/audio.mp3");
        meeting.setCreatedAt(Instant.parse("2026-01-01T09:00:00Z"));
        return meeting;
    }

    @Nested
    @DisplayName("what is held")
    class Inventory {

        @Test
        @DisplayName("separates recordings still here from recordings already erased")
        void countsErasures() {
            Meeting kept = meeting("mtg_1", "Sprint planning");
            Meeting stripped = meeting("mtg_2", "One-to-one");
            stripped.setObjectKey(null);
            stripped.setAudioDeletedAt(Instant.parse("2026-06-01T09:00:00Z"));
            stripped.setTranscriptDeletedAt(Instant.parse("2026-06-01T09:00:00Z"));
            when(meetings.findByUserIdOrderByCreatedAtDesc(USER)).thenReturn(List.of(kept, stripped));

            PrivacyOverviewResponse.Held held = service.overview(USER, TODAY).held();

            assertThat(held.meetings()).isEqualTo(2);
            assertThat(held.recordings()).isEqualTo(1);
            assertThat(held.audioErased()).isEqualTo(1);
            assertThat(held.transcripts()).isEqualTo(1);
            assertThat(held.transcriptsErased()).isEqualTo(1);
        }

        @Test
        @DisplayName("counts only the meetings whose recorder confirmed the room was told")
        void countsConsent() {
            Meeting recorded = meeting("mtg_1", "Standup");
            recorded.setConsentConfirmedAt(Instant.parse("2026-02-02T09:00:00Z"));
            when(meetings.findByUserIdOrderByCreatedAtDesc(USER))
                    .thenReturn(List.of(recorded, meeting("mtg_2", "Uploaded file")));

            assertThat(service.overview(USER, TODAY).held().consentConfirmed()).isEqualTo(1);
        }

        @Test
        @DisplayName("reports the oldest thing it has, which is what a retention dial acts on first")
        void reportsTheOldest() {
            Meeting older = meeting("mtg_1", "First ever");
            older.setCreatedAt(Instant.parse("2025-03-04T09:00:00Z"));
            when(meetings.findByUserIdOrderByCreatedAtDesc(USER))
                    .thenReturn(List.of(meeting("mtg_2", "Recent"), older));

            assertThat(service.overview(USER, TODAY).held().oldestMeetingAt())
                    .isEqualTo(Instant.parse("2025-03-04T09:00:00Z"));
        }
    }

    @Nested
    @DisplayName("how it is stored")
    class Storage {

        @Test
        @DisplayName("says nothing about encryption when the bucket applies none")
        void doesNotClaimWhatIsNotTrue() {
            when(storage.encryptionAtRest()).thenReturn(Optional.empty());

            assertThat(service.overview(USER, TODAY).storage().encryptionAtRest()).isNull();
        }

        @Test
        @DisplayName("repeats what the bucket actually reports")
        void repeatsTheBucket() {
            when(storage.encryptionAtRest()).thenReturn(Optional.of("AES256"));

            PrivacyOverviewResponse.StorageFacts facts = service.overview(USER, TODAY).storage();

            assertThat(facts.encryptionAtRest()).isEqualTo("AES256");
            assertThat(facts.signedUrlSeconds()).isEqualTo(900L);
            assertThat(facts.rowLevelSecurity()).isTrue();
        }
    }

    @Nested
    @DisplayName("closing the account")
    class Closing {

        @Test
        @DisplayName("refuses anything but the phrase")
        void refusesTheWrongWords() {
            assertThatThrownBy(() -> service.closeAccount(USER, "yes"))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("delete everything");
            assertThatThrownBy(() -> service.closeAccount(USER, null))
                    .isInstanceOf(ApiException.class);
            verify(erasure, never()).eraseAccount(anyString());
        }

        @Test
        @DisplayName("accepts the phrase whatever the spacing and case")
        void toleratesTypingHabits() {
            when(meetings.countByUserId(USER)).thenReturn(3L);
            when(erasure.eraseAccount(USER)).thenReturn(3);

            PrivacyService.Closed closed = service.closeAccount(USER, "  Delete Everything  ");

            assertThat(closed.meetings()).isEqualTo(3);
            assertThat(closed.storedObjects()).isEqualTo(3);
        }

        @Test
        @DisplayName("counts what was there before it goes, since afterwards nothing can be counted")
        void countsBeforeDeleting() {
            when(meetings.countByUserId(USER)).thenReturn(12L);
            when(erasure.eraseAccount(USER)).thenReturn(9);

            var order = org.mockito.Mockito.inOrder(meetings, erasure);
            service.closeAccount(USER, "delete everything");

            order.verify(meetings).countByUserId(USER);
            order.verify(erasure).eraseAccount(USER);
        }
    }

    @Nested
    @DisplayName("retention on the page")
    class Retention {

        @Test
        @DisplayName("shows both dials with what they would take tonight")
        void showsThePreview() {
            user.setAudioRetentionDays(30);
            user.setMeetingRetentionDays(365);
            when(retention.preview(USER, 30, 365, TODAY)).thenReturn(new RetentionService.Due(4, 1));

            PrivacyOverviewResponse.Retention shown = service.overview(USER, TODAY).retention();

            assertThat(shown.audioDays()).isEqualTo(30);
            assertThat(shown.meetingDays()).isEqualTo(365);
            assertThat(shown.recordingsDueNow()).isEqualTo(4);
            assertThat(shown.meetingsDueNow()).isEqualTo(1);
        }

        @Test
        @DisplayName("answers a change with what the new policy would do, not the old one")
        void previewsTheNewPolicy() {
            UserEntity updated = new UserEntity();
            updated.setId(USER);
            updated.setAudioRetentionDays(7);
            when(retention.setPolicy(USER, 7, null)).thenReturn(updated);
            when(retention.preview(USER, 7, null, TODAY)).thenReturn(new RetentionService.Due(11, 0));

            PrivacyOverviewResponse.Retention shown = service.setRetention(USER, 7, null, TODAY);

            assertThat(shown.audioDays()).isEqualTo(7);
            assertThat(shown.recordingsDueNow()).isEqualTo(11);
        }
    }

    @Nested
    @DisplayName("the clock")
    class Clock {

        @Test
        @DisplayName("is UTC, the same one every scheduled thing already agrees on")
        void isUtc() {
            assertThat(PrivacyService.todayUtc()).isEqualTo(LocalDate.now(ZoneOffset.UTC));
        }
    }

    @Nested
    @DisplayName("the identity prerequisite")
    class BeforeErasure {

        @Test
        @DisplayName("binds the current verified identity before anything is destroyed")
        void bindsFirst() {
            /*
             * THE ORDERING IS THE POINT.
             *
             * <p>`eraseAccount` deletes storage objects before it deletes any
             * row, and no transaction rolls an object store back. A prerequisite
             * that ran after it would be a prerequisite that had already lost
             * somebody's audio.
             */
            service.closeAccount(USER, "delete everything");

            InOrder order = inOrder(freeTier, erasure);
            order.verify(freeTier).bindCurrentIdentityBeforeDeletion(USER, "user_2clerk");
            order.verify(erasure).eraseAccount(USER);
        }

        @Test
        @DisplayName("passes the subject from the row, which is the session's own")
        void usesTheStoredSubject() {
            // `provision` looks the row up *by* clerk_user_id from the verified
            // token, so the value on it is the subject of the session making
            // this call. There is no path by which a caller names another.
            service.closeAccount(USER, "delete everything");

            verify(freeTier).bindCurrentIdentityBeforeDeletion(USER, "user_2clerk");
        }

        @Test
        @DisplayName("erases nothing at all when the identity cannot be confirmed")
        void erasesNothingWhenItRefuses() {
            /*
             * The failure that matters. Clerk is unavailable, so the current
             * address cannot be aliased — and deleting anyway would leave the
             * spent allowance unclaimable and hand out another one on the next
             * sign-up. Nothing is erased, nothing is mailed, and the caller can
             * retry.
             */
            doThrow(ApiException.serviceUnavailable(
                    "We couldn't complete account deletion just now. Please try again."))
                    .when(freeTier)
                    .bindCurrentIdentityBeforeDeletion(anyString(), anyString());

            assertThatThrownBy(() -> service.closeAccount(USER, "delete everything"))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("couldn't complete account deletion");

            verify(erasure, never()).eraseAccount(anyString());
            verify(mail, never()).accountClosed(anyString(), org.mockito.ArgumentMatchers.any(),
                    org.mockito.ArgumentMatchers.anyLong(),
                    org.mockito.ArgumentMatchers.anyInt());
        }

        @Test
        @DisplayName("still checks the phrase first, so a stray call asks Clerk nothing")
        void thePhraseComesFirst() {
            // Cheapest refusal first: a mistyped confirmation must not spend a
            // Clerk lookup, and must not reach the prerequisite at all.
            assertThatThrownBy(() -> service.closeAccount(USER, "nope"))
                    .isInstanceOf(ApiException.class);

            verify(freeTier, never())
                    .bindCurrentIdentityBeforeDeletion(anyString(), anyString());
            verify(erasure, never()).eraseAccount(anyString());
        }

        @Test
        @DisplayName("calls it in system context, which is the only way it can write")
        void inSystemContext() throws Exception {
            /*
             * NOT A STYLE PREFERENCE -- THE WRITE FAILS WITHOUT IT.
             *
             * <p>`free_tier_identities` has no row-level security policy at all
             * (V69), so a tenant connection cannot insert into it: Postgres
             * refuses with "new row violates row-level security policy". That is
             * deliberate -- a policy permissive enough to write with would have
             * been permissive enough to DELETE with, and deleting your own
             * mapping before deleting your account is the reset being closed
             * here. It is proved directly, as an unprivileged role, in
             * `FreeTierLifecycleTest.thePoliciesHold`.
             *
             * <p>Which leaves this call needing a privileged connection, and
             * `closeAccount` is a request holding a tenant one. The route is
             * decided when a transaction checks its connection out, so the flag
             * has to be set *before* the method begins -- hence `runAsSystem`
             * here and `REQUIRES_NEW` there, pinned by the case below.
             *
             * <p>Asserted at the moment of the call rather than after it,
             * because after it the flag is deliberately back to what it was.
             */
            boolean[] privileged = {false};
            doAnswer(invocation -> {
                privileged[0] = TenantContext.isSystem();
                return null;
            }).when(freeTier).bindCurrentIdentityBeforeDeletion(anyString(), anyString());

            service.closeAccount(USER, "delete everything");

            assertThat(privileged[0]).isTrue();
            // And restored, on a pooled request thread that serves somebody
            // else next.
            assertThat(TenantContext.isSystem()).isFalse();
        }

        @Test
        @DisplayName("and it is REQUIRES_NEW, so the connection is checked out again")
        void requiresANewTransaction() throws Exception {
            /*
             * The other half of the same requirement, and the half that is
             * silent when it breaks. `runAsSystem` around a method that JOINS
             * the caller's transaction changes nothing: the connection was
             * checked out before the flag was set, so the insert still runs on
             * the tenant pool and account deletion starts failing in production
             * while every mock in this file stays green.
             *
             * <p>So the annotation is asserted. It is the load-bearing part of
             * a mechanism no unit test can otherwise see.
             */
            Transactional tx = FreeTierService.class
                    .getMethod("bindCurrentIdentityBeforeDeletion", String.class, String.class)
                    .getAnnotation(Transactional.class);

            assertThat(tx).isNotNull();
            assertThat(tx.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
        }
    }
}
