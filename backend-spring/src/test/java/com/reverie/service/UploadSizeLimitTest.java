package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.dto.MeetingCreateRequest;
import com.reverie.dto.UploadUrlRequest;
import com.reverie.entity.Meeting;
import com.reverie.repository.MeetingInsightRepository;
import com.reverie.repository.MeetingRepository;
import com.reverie.repository.MeetingSummaryRepository;
import com.reverie.repository.MeetingTranscriptRepository;
import com.reverie.repository.MeetingTranslationRepository;
import com.reverie.repository.ProjectRepository;
import com.reverie.repository.TranscriptSegmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What it costs to lie about the size of an upload.
 *
 * <h2>The hole</h2>
 *
 * <p>{@code UploadUrlRequest} carried {@code sizeBytes} and nothing read it.
 * The presigned URL was signed over the bucket, the key and the content type,
 * and a presigned PUT cannot be made to enforce a length — the signature covers
 * the request, not the body — so S3 accepted whatever arrived under it. Then
 * confirmation charged the allowance and queued the meeting for transcription
 * without ever asking the bucket what had actually landed.
 *
 * <p>So {@code {"sizeBytes": 1}} followed by a multi-gigabyte PUT bought
 * storage, an AssemblyAI job and an embedding run, and the allowance meant to
 * stop it was spent by the same request that started it.
 *
 * <h2>The two halves</h2>
 *
 * <p>Neither is sufficient alone, which is why both are here. The declared size
 * is advisory and free — it stops the honest mistake before an upload URL
 * exists. The HEAD after upload is authoritative and is what makes the limit
 * true, and it has to happen <em>before</em> the allowance and the queue or it
 * is only a slower way to be robbed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UploadSizeLimitTest {

    private static final String USER = "usr_1";
    private static final String KEY = "meetings/usr_1/mtg_1/audio.mp3";

    /** The shipped default, which is what `maxUploadBytes` holds unwired. */
    private static final long MAX = 524_288_000L;

    @Mock private MeetingRepository meetings;
    @Mock private MeetingTranscriptRepository transcripts;
    @Mock private TranscriptSegmentRepository segments;
    @Mock private MeetingSummaryRepository summaries;
    @Mock private MeetingInsightRepository insights;
    @Mock private StorageService storage;
    @Mock private UsageLimitService usage;
    @Mock private OutboxService outbox;
    @Mock private AuditService audit;
    @Mock private AiClient ai;
    @Mock private SummaryTemplateService templates;
    @Mock private ProjectRepository projects;
    @Mock private MeetingTranslationRepository translations;
    @Mock private NotificationService notifications;
    @Mock private ErasureService erasure;
    @Mock private UserService users;

    private MeetingService service;
    private Meeting pending;

    @BeforeEach
    void setUp() {
        service = new MeetingService(meetings, transcripts, segments, summaries, insights,
                storage, usage, outbox, audit, ai, templates, projects, translations,
                notifications, erasure, users);

        pending = new Meeting();
        pending.setId("mtg_1");
        pending.setUserId(USER);
        pending.setObjectKey(KEY);
        when(meetings.findByObjectKeyAndUserId(KEY, USER)).thenReturn(Optional.of(pending));
        when(meetings.save(any(Meeting.class))).thenAnswer(inv -> inv.getArgument(0));
        when(storage.presignUpload(anyString(), anyString())).thenReturn("https://example/put");
    }

    private static UploadUrlRequest presign(long sizeBytes) {
        return new UploadUrlRequest("standup.mp3", "audio/mpeg", sizeBytes);
    }

    private static MeetingCreateRequest confirm() {
        return new MeetingCreateRequest(KEY, "standup.mp3", null, "audio/mpeg", 600,
                null, null, null, false, null, null);
    }

    @Nested
    @DisplayName("before a URL is handed out")
    class AtPresign {

        @Test
        @DisplayName("an ordinary file gets its upload URL")
        void ordinarySizePasses() {
            assertThat(service.createUploadUrl(USER, presign(12_000_000L)).uploadUrl())
                    .isEqualTo("https://example/put");
        }

        @Test
        @DisplayName("a file over the limit is refused before anything is signed")
        void oversizeIsRefused() {
            assertThatThrownBy(() -> service.createUploadUrl(USER, presign(MAX + 1)))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("limit");

            // No pending meeting, and nothing to PUT to.
            verify(storage, never()).presignUpload(anyString(), anyString());
            verify(meetings, never()).save(any(Meeting.class));
        }

        @Test
        @DisplayName("an empty file is refused")
        void emptyIsRefused() {
            assertThatThrownBy(() -> service.createUploadUrl(USER, presign(0)))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Nested
    @DisplayName("after the bytes have landed")
    class AtConfirmation {

        @Test
        @DisplayName("a declared size of one and a huge object is refused")
        void theLieIsCaught() {
            // The attack, exactly. Presign said one byte and passed; the object
            // that arrived is far over the limit, and only the bucket knows.
            when(storage.sizeOf(KEY)).thenReturn(Optional.of(MAX + 1));

            assertThatThrownBy(() -> service.createMeeting(USER, confirm()))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("limit");
        }

        @Test
        @DisplayName("and costs the user nothing and the pipeline nothing")
        void refusalIsFree() {
            // The ordering that matters. Charging first would mean the
            // allowance meant to stop this is spent by the attempt, and
            // enqueueing first would mean transcription is already paid for.
            when(storage.sizeOf(KEY)).thenReturn(Optional.of(MAX + 1));

            assertThatThrownBy(() -> service.createMeeting(USER, confirm()))
                    .isInstanceOf(ApiException.class);

            verify(usage, never()).chargeMeetingOrThrow(anyString(), anyBoolean(), anyInt());
            verify(outbox, never()).enqueue(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("an object that never arrived is refused rather than queued")
        void missingObjectIsRefused() {
            when(storage.sizeOf(KEY)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.createMeeting(USER, confirm()))
                    .isInstanceOf(ApiException.class);

            verify(usage, never()).chargeMeetingOrThrow(anyString(), anyBoolean(), anyInt());
        }

        @Test
        @DisplayName("a store that will not answer is refused, not waved through")
        void unknownSizeIsRefused() {
            // `sizeOf` answers empty for a credentials problem or an
            // unreachable endpoint as well as for a missing object. Treating
            // "I do not know" as "fine" would make an object-store outage the
            // window in which the limit does not apply.
            when(storage.sizeOf(KEY)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.createMeeting(USER, confirm()))
                    .isInstanceOf(ApiException.class);

            verify(outbox, never()).enqueue(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("an honest upload is charged and queued as before")
        void honestUploadProceeds() {
            // The limit must not have cost the ordinary path. If this fails,
            // the fix has broken uploading rather than secured it.
            when(storage.sizeOf(KEY)).thenReturn(Optional.of(12_000_000L));
            when(templates.requireKnown(any())).thenReturn(null);

            service.createMeeting(USER, confirm());

            verify(usage).chargeMeetingOrThrow(USER, false, 600);
        }
    }
}
