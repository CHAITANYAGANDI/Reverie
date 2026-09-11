package com.reverie.controller;

import com.reverie.common.ApiException;
import com.reverie.dto.MeetingLanguageRequest;
import com.reverie.dto.ResummarizeRequest;
import com.reverie.dto.UploadUrlRequest;
import com.reverie.service.ErasureService;
import com.reverie.service.MeetingService;
import com.reverie.service.RateLimitService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Burst protection on the endpoints that spend money.
 *
 * <h2>The bypass this is really about</h2>
 *
 * <p>{@code POST /{id}/language} does not just set a language: it sets it and
 * then calls {@code reprocess}, launching the same billable re-transcription
 * the explicit reprocess endpoint launches. Two endpoints, one pipeline — so
 * they must spend from one bucket, or a caller alternating between them gets
 * twice the re-transcriptions the limit was written to allow.
 *
 * <p>That is also why the check is in the controller. Put it inside
 * {@code MeetingService.reprocess} and a single language request would be
 * charged twice for the one thing the user asked for, because the service
 * method calls itself through.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MeetingControllerTest {

    private static final String USER = "usr_1";

    @Mock MeetingService meetings;
    @Mock ErasureService erasure;
    @Mock RateLimitService rateLimit;

    MeetingController controller;

    @BeforeEach
    void setUp() {
        controller = new MeetingController(meetings, erasure, rateLimit);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        USER, null, AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void refuse(RateLimitService rateLimit) {
        doThrow(ApiException.usageLimitReached("Too many requests; please slow down."))
                .when(rateLimit).checkOrThrow(anyString(), anyString(), anyInt(),
                        any(Duration.class));
    }

    @Nested
    @DisplayName("reprocessing, however it is asked for")
    class Reprocessing {

        @Test
        @DisplayName("an explicit reprocess spends from meeting-reprocess")
        void reprocessIsLimited() {
            controller.reprocess("mtg_1");

            verify(rateLimit).checkOrThrow(eq("meeting-reprocess"), eq(USER), anyInt(),
                    any(Duration.class));
        }

        @Test
        @DisplayName("a language change spends from the SAME bucket")
        void languageSharesTheBucket() {
            controller.setLanguage("mtg_1", new MeetingLanguageRequest("de"));

            verify(rateLimit).checkOrThrow(eq("meeting-reprocess"), eq(USER), anyInt(),
                    any(Duration.class));
        }

        @Test
        @DisplayName("so alternating them cannot double the re-transcriptions")
        void alternatingCannotDoubleTheAllowance() {
            controller.reprocess("mtg_1");
            controller.setLanguage("mtg_1", new MeetingLanguageRequest("de"));

            ArgumentCaptor<String> buckets = ArgumentCaptor.forClass(String.class);
            verify(rateLimit, times(2)).checkOrThrow(buckets.capture(), eq(USER), anyInt(),
                    any(Duration.class));

            assertThat(buckets.getAllValues())
                    .containsExactly("meeting-reprocess", "meeting-reprocess");
        }

        @Test
        @DisplayName("and one language request is charged exactly once")
        void languageIsChargedOnce() {
            /*
             * The double-count this design avoids. `setSpokenLanguage` calls
             * `reprocess` internally, so a limiter placed in the service would
             * see two events for the one request a user made -- and a user
             * allowed three reprocesses would get one and a half.
             */
            controller.setLanguage("mtg_1", new MeetingLanguageRequest("de"));

            verify(rateLimit, times(1)).checkOrThrow(anyString(), anyString(), anyInt(),
                    any(Duration.class));
        }

        @Test
        @DisplayName("a refusal queues nothing")
        void refusalDoesNotReachTheService() {
            refuse(rateLimit);

            assertThatThrownBy(() -> controller.reprocess("mtg_1"))
                    .isInstanceOf(ApiException.class);

            // No attempt increment, no Kafka enqueue, no provider work.
            verifyNoInteractions(meetings);
        }

        @Test
        @DisplayName("and neither does a refused language change")
        void refusedLanguageDoesNotReachTheService() {
            refuse(rateLimit);

            assertThatThrownBy(() ->
                    controller.setLanguage("mtg_1", new MeetingLanguageRequest("de")))
                    .isInstanceOf(ApiException.class);

            verifyNoInteractions(meetings);
        }
    }

    @Nested
    @DisplayName("rewriting a summary")
    class Resummarizing {

        @Test
        @DisplayName("spends from its own bucket, not the reprocess one")
        void hasItsOwnBucket() {
            // Separate because the costs are different by an order of
            // magnitude: rewriting re-reads a transcript already paid for,
            // reprocessing buys the transcription again.
            controller.resummarize("mtg_1", new ResummarizeRequest("standup"));

            verify(rateLimit).checkOrThrow(eq("meeting-resummarize"), eq(USER), anyInt(),
                    any(Duration.class));
        }

        @Test
        @DisplayName("and is refused before the model is asked")
        void refusalDoesNotReachTheService() {
            refuse(rateLimit);

            assertThatThrownBy(() ->
                    controller.resummarize("mtg_1", new ResummarizeRequest("standup")))
                    .isInstanceOf(ApiException.class);

            verifyNoInteractions(meetings);
        }
    }

    @Nested
    @DisplayName("minting an upload URL")
    class UploadUrls {

        @Test
        @DisplayName("spends from meeting-upload-url")
        void isLimited() {
            /*
             * Not an AI limit. Presigning charges no allowance at all --
             * meetings are charged at confirmation so abandoned uploads stay
             * free -- which leaves this the one authenticated endpoint that
             * mints pending rows and storage capability URLs without bound.
             */
            controller.uploadUrl(new UploadUrlRequest("standup.mp3", "audio/mpeg", 4_000_000L));

            verify(rateLimit).checkOrThrow(eq("meeting-upload-url"), eq(USER), anyInt(),
                    any(Duration.class));
        }

        @Test
        @DisplayName("and a refusal presigns nothing")
        void refusalDoesNotReachTheService() {
            refuse(rateLimit);

            assertThatThrownBy(() -> controller.uploadUrl(
                    new UploadUrlRequest("standup.mp3", "audio/mpeg", 4_000_000L)))
                    .isInstanceOf(ApiException.class);

            verifyNoInteractions(meetings);
        }
    }

    @Nested
    @DisplayName("what is deliberately left alone")
    class NotRateLimited {

        /*
         * Confirming a meeting is NOT burst-limited, and that is a decision
         * rather than an omission. `chargeMeetingOrThrow` is a real counting
         * cap -- three imports and a hundred minutes for the life of the
         * account, incremented on every confirmation -- so the total cost of
         * this endpoint is bounded however fast it is called. The rate of
         * arrival is already bounded too, because every confirmation needs an
         * upload URL and those are limited above. A second bucket here would
         * only be able to refuse a legitimate batch upload.
         */

        @Test
        @DisplayName("confirming a meeting, because the allowance already counts them")
        void createIsNotBurstLimited() {
            controller.create(new com.reverie.dto.MeetingCreateRequest(
                    "meetings/usr_1/mtg_1/standup.mp3", "Standup", null, "audio/mpeg",
                    600, null, null, null, false, null, null));

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("reading a meeting")
        void readsAreNotLimited() {
            controller.get("mtg_1");

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("renaming speakers, which asks no model")
        void speakerRenameIsNotLimited() {
            controller.renameSpeakers("mtg_1", new com.reverie.dto.SpeakerRenameRequest(
                    java.util.Map.of("Speaker 1", "Cindy")));

            verifyNoInteractions(rateLimit);
        }
    }

    @Nested
    @DisplayName("the limiter is keyed to the account")
    class KeyedByUser {

        @Test
        @DisplayName("not to the meeting, which a caller can rotate")
        void meetingIdIsNotTheKey() {
            // Keying a cost limit by meeting would let one account defeat it by
            // reprocessing a different meeting each time.
            controller.reprocess("mtg_private_789");

            ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
            verify(rateLimit).checkOrThrow(anyString(), key.capture(), anyInt(),
                    any(Duration.class));

            assertThat(key.getValue()).isEqualTo(USER);
            assertThat(key.getValue()).doesNotContain("mtg_private_789");
        }

        @Test
        @DisplayName("and the service is handed the same account")
        void limiterAndServiceAgree() {
            controller.reprocess("mtg_1");

            verify(meetings).reprocess(eq(USER), eq("mtg_1"));
        }
    }

    @Nested
    @DisplayName("there has to be somebody to charge")
    class Unauthenticated {

        @Test
        @DisplayName("an unattributable reprocess is refused before the pipeline")
        void refusesWithNoPrincipal() {
            SecurityContextHolder.clearContext();

            assertThatThrownBy(() -> controller.reprocess("mtg_1"))
                    .isInstanceOf(RuntimeException.class);

            verify(meetings, never()).reprocess(anyString(), anyString());
        }
    }
}
