package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.domain.SourceType;
import com.reverie.domain.SummarySection;
import com.reverie.dto.AudioDownloadResponse;
import com.reverie.dto.AudioExportResponse;
import com.reverie.dto.TranslationResponse;
import com.reverie.entity.Meeting;
import com.reverie.entity.MeetingActionItem;
import com.reverie.entity.MeetingSummary;
import com.reverie.entity.TranscriptSegment;
import com.reverie.export.ExportDocument;
import com.reverie.export.PdfFonts;
import com.reverie.export.PdfRenderer;
import com.reverie.repository.MeetingActionItemRepository;
import com.reverie.repository.MeetingRepository;
import com.reverie.repository.MeetingSummaryRepository;
import com.reverie.repository.TranscriptSegmentRepository;
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

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Assembling a meeting into a document.
 *
 * <p>These tests are about what goes into the file and what it says, which is
 * the part that has to be decided once for all four formats. The renderers are
 * stood in for by one that keeps whatever it was handed, so an assertion here is
 * about the document rather than about markdown's asterisks.
 *
 * <p>Two themes run through them. One is that an export is a record: an empty
 * section keeps its heading, a finished task is still in the list, and the words
 * somebody used for a deadline survive. The other is that a translated export
 * must not overstate itself — the audio was not translated, the speakers were
 * not translated, and a line recorded since is shown as it was said.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExportServiceTest {

    private static final String USER = "usr_1";
    private static final String MEETING = "mtg_1";

    @Mock private MeetingRepository meetings;
    @Mock private MeetingSummaryRepository summaries;
    @Mock private MeetingActionItemRepository actionItems;
    @Mock private TranscriptSegmentRepository segments;
    @Mock private TranslationService translations;
    @Mock private StorageService storage;
    @Mock private AiClient ai;

    private Capturing renderer;
    private ExportService service;

    /**
     * A renderer that renders nothing and keeps everything.
     *
     * <p>A subclass rather than an implementation of an interface: there is one
     * renderer now, and the service holds it concretely. What these tests are
     * about is the <em>document</em> the service assembles, which is the thing
     * every assertion below reads off `last` -- rendering it to real PDF bytes
     * and parsing them back would test openpdf instead.
     */
    private static final class Capturing extends PdfRenderer {
        private ExportDocument last;

        Capturing() {
            super(new PdfFonts());
        }

        @Override
        public byte[] render(ExportDocument document) {
            this.last = document;
            return "rendered".getBytes(StandardCharsets.UTF_8);
        }
    }

    @BeforeEach
    void setUp() {
        renderer = new Capturing();
        service = new ExportService(meetings, summaries, actionItems, segments,
                translations, storage, ai, renderer);

        when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(meeting()));
        when(summaries.findFirstByMeetingIdOrderByCreatedAtDesc(MEETING))
                .thenReturn(Optional.of(summary()));
        when(actionItems.findByMeetingId(MEETING)).thenReturn(tasks());
        when(segments.findByMeetingIdOrderByStartTimeAsc(MEETING)).thenReturn(transcript());
    }

    /**
     * The summary document: every section, and the action items.
     *
     * <p>Where a single `exported(includeTranscript, language)` used to stand.
     * The pair of booleans and the option object it grew into described several
     * hundred documents; there are two.
     */
    private ExportDocument summaryDoc(String language) {
        service.summaryPdf(USER, MEETING, language, "Europe/London");
        return renderer.last;
    }

    /** The transcript document: the words, with who said them and when. */
    private ExportDocument transcriptDoc(String language) {
        service.transcriptPdf(USER, MEETING, language, "Europe/London");
        return renderer.last;
    }

    private static List<ExportDocument.Utterance> utterances(List<ExportDocument.Block> blocks) {
        return blocks.stream()
                .filter(b -> b instanceof ExportDocument.Block.Transcript)
                .map(b -> ((ExportDocument.Block.Transcript) b).lines())
                .findFirst()
                .orElse(List.of());
    }

    /* ------------------------------ the brief ----------------------------- */

    @Nested
    @DisplayName("the brief")
    class Brief {

        @Test
        void writesTheTemplateSSectionsInOrder() {
            List<ExportDocument.Block> blocks = summaryDoc(null).blocks();

            assertThat(headings(blocks)).containsSubsequence("Decisions", "Budget", "Action items");
        }

        @Test
        void keepsASectionTheMeetingNeverReached() {
            List<ExportDocument.Block> blocks = summaryDoc(null).blocks();

            // A file is a record. "Budget" with a line saying it was not
            // discussed is a finding; dropping the heading loses it.
            int budget = headings(blocks).indexOf("Budget");
            assertThat(budget).isGreaterThanOrEqualTo(0);
            assertThat(blocks).anyMatch(b -> b instanceof ExportDocument.Block.Aside a
                    && a.text().equals("Not discussed."));
        }

        @Test
        void fallsBackToTheFlatSummaryWhenThereIsNoTemplate() {
            MeetingSummary flat = summary();
            flat.setSections(List.of());
            when(summaries.findFirstByMeetingIdOrderByCreatedAtDesc(MEETING))
                    .thenReturn(Optional.of(flat));

            List<ExportDocument.Block> blocks = summaryDoc(null).blocks();

            // Meetings summarised before templates existed have nothing else,
            // and an empty file for them would be a regression, not a tidy-up.
            assertThat(headings(blocks)).contains("Summary", "Key points");
            assertThat(blocks).anyMatch(b -> b instanceof ExportDocument.Block.Prose p
                    && p.text().equals("We agreed to move billing to Stripe."));
        }

        @Test
        void survivesAMeetingWithNoSummaryAtAll() {
            when(summaries.findFirstByMeetingIdOrderByCreatedAtDesc(MEETING)).thenReturn(Optional.empty());

            // Still worth exporting: the tasks and the transcript are the whole
            // meeting for somebody who reprocessed it and lost the notes. Two
            // files now, so the assertion is two -- and a summary PDF with no
            // summary in it still carries what people agreed to do.
            assertThat(headings(summaryDoc(null).blocks())).contains("Action items");
            assertThat(headings(transcriptDoc(null).blocks())).contains("Transcript");
        }
    }

    /* ------------------------------- the tasks ---------------------------- */

    @Nested
    @DisplayName("action items")
    class Tasks {

        @Test
        void keepsTheWordsSomebodyUsedForADeadline() {
            ExportDocument.Task task = firstTask(summaryDoc(null));

            // "before the demo" is what was promised. Replacing it with a date
            // is putting a commitment in somebody's mouth they did not make.
            assertThat(task.detail()).isEqualTo("Priya · due friday");
        }

        @Test
        void keepsFinishedWorkInTheList() {
            List<ExportDocument.Task> all = allTasks(summaryDoc(null));

            // A list that empties as you work makes the work look like it never
            // happened, and a file is exactly where somebody looks it up.
            assertThat(all).hasSize(2);
            assertThat(all.get(1).done()).isTrue();
        }

        @Test
        void leavesTheHeadingOutWhenThereAreNoTasks() {
            when(actionItems.findByMeetingId(MEETING)).thenReturn(List.of());

            assertThat(headings(summaryDoc(null).blocks())).doesNotContain("Action items");
        }
    }

    /* ---------------------------- the transcript -------------------------- */

    @Nested
    @DisplayName("the transcript")
    class Transcript {

        @Test
        void isLeftOutUnlessItIsAskedFor() {
            assertThat(headings(summaryDoc(null).blocks())).doesNotContain("Transcript");
        }

        @Test
        void carriesTheTimeAndTheSpeakerWithEveryLine() {
            ExportDocument.Utterance first = utterances(transcriptDoc(null)).get(0);

            assertThat(first.timecode()).isEqualTo("0:00");
            assertThat(first.speaker()).isEqualTo("Priya");
            assertThat(first.text()).isEqualTo("Right, shall we start?");
        }

        @Test
        void writesTimesOverAnHourAsHours() {
            TranscriptSegment late = segment("seg_3", 3725.0, "Marcus", "Still going.");
            when(segments.findByMeetingIdOrderByStartTimeAsc(MEETING)).thenReturn(List.of(late));

            assertThat(utterances(transcriptDoc(null)).get(0).timecode()).isEqualTo("1:02:05");
        }

        @Test
        void namesAnUnidentifiedVoiceRatherThanLeavingAGap() {
            TranscriptSegment anonymous = segment("seg_9", 0.0, null, "Someone said this.");
            when(segments.findByMeetingIdOrderByStartTimeAsc(MEETING)).thenReturn(List.of(anonymous));

            assertThat(utterances(transcriptDoc(null)).get(0).speaker()).isEqualTo("Speaker");
        }
    }

    /* ---------------------------- translations ---------------------------- */

    @Nested
    @DisplayName("read in another language")
    class Translated {

        @BeforeEach
        void translated() {
            when(translations.get(USER, MEETING, "es")).thenReturn(spanish());
        }

        @Test
        void writesTheDocumentInThatLanguage() {
            ExportDocument doc = summaryDoc("es");

            assertThat(doc.language()).isEqualTo(com.reverie.domain.Language.SPANISH);
            assertThat(headings(doc.blocks())).contains("Decisiones");
        }

        @Test
        void labelsItsOwnHeadingsInThatLanguageToo() {
            // "Action items" in the middle of a Spanish document reads as a
            // translation that gave up half way through. One heading per file.
            assertThat(headings(summaryDoc("es").blocks())).contains("Tareas");
            assertThat(headings(transcriptDoc("es").blocks())).contains("Transcripción");
        }

        @Test
        void saysWhatWasTranslatedAndWhatWasNot() {
            // Somebody who forgets they are reading a translation is exactly the
            // person about to quote a translated line as a thing said aloud.
            assertThat(summaryDoc("es").notice())
                    .isEqualTo("Translated into Spanish. The recording is in English.");
        }

        @Test
        void takesTheSpeakerAndTheTimingFromTheLiveTranscript() {
            ExportDocument.Utterance line = utterances(transcriptDoc("es")).get(0);

            // Not stored with the translation: a speaker renamed afterwards has
            // to be renamed in every language, not only in the one regenerated.
            assertThat(line.speaker()).isEqualTo("Priya");
            assertThat(line.timecode()).isEqualTo("0:00");
            assertThat(line.text()).isEqualTo("¿Empezamos?");
        }

        @Test
        void showsALineRecordedSinceInTheOriginal() {
            // A gap would be worse than English: a missing line in a transcript
            // reads as a silence in the room.
            assertThat(utterances(transcriptDoc("es")).get(1).text())
                    .isEqualTo("I'll draft the rollout plan before the demo.");
        }

        @Test
        void showsATaskWhoseWordingHasMovedOnAsItIsNow() {
            ExportDocument.Task task = firstTask(summaryDoc("es"));

            assertThat(task.title()).isEqualTo("Terminar la validación de JWT");
        }

        @Test
        void refusesALanguageTheMeetingWasNeverTranslatedInto() {
            when(translations.get(USER, MEETING, "de"))
                    .thenThrow(ApiException.notFound("This meeting has not been translated into German"));

            // A download is a GET, and translating on demand would make one
            // quietly cost a model call and five seconds.
            assertThatThrownBy(() -> summaryDoc("de"))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("German");
        }
    }

    /* ------------------------------ the file ------------------------------ */

    @Nested
    @DisplayName("the file itself")
    class File {

        @Test
        void isNamedAfterTheMeetingAndAfterWhatIsInIt() {
            /*
             * `sprint-planning-summary.pdf`, not `sprint-planning.pdf`.
             *
             * <p>Two documents come out of one meeting now. Named only after
             * the meeting they would collide in a downloads folder, and the
             * second would arrive as `sprint-planning (1).pdf` -- which of the
             * two being anybody's guess.
             */
            assertThat(service.summaryPdf(USER, MEETING, null, null).filename())
                    .isEqualTo("sprint-planning-summary.pdf");
            assertThat(service.transcriptPdf(USER, MEETING, null, null).filename())
                    .isEqualTo("sprint-planning-transcript.pdf");
        }

        @Test
        void isAPdf() {
            // The whole product contract for a document, in one assertion.
            assertThat(service.summaryPdf(USER, MEETING, null, null).mediaType())
                    .isEqualTo("application/pdf");
            assertThat(service.transcriptPdf(USER, MEETING, null, null).mediaType())
                    .isEqualTo("application/pdf");
        }

        @Test
        void datesTheDocumentInTheReaderSTimeZone() {
            // 23:30 UTC is the next day in Tokyo. A file dated a day off from
            // what the app showed looks like the wrong meeting.
            service.summaryPdf(USER, MEETING, null, "Asia/Tokyo");

            assertThat(renderer.last.meta().get(0)).contains("2026");
            assertThat(renderer.last.meta().get(0)).isNotEqualTo(utcDate());
        }

        @Test
        void fallsBackToUtcRatherThanFailingOnANonsenseZone() {
            service.summaryPdf(USER, MEETING, null, "Middle/Earth");

            assertThat(renderer.last.meta().get(0)).isEqualTo(utcDate());
        }

        private String utcDate() {
            service.summaryPdf(USER, MEETING, null, "UTC");
            return renderer.last.meta().get(0);
        }

        @Test
        void saysHowLongTheMeetingWas() {
            assertThat(summaryDoc(null).meta()).contains("42 min", "planning");
        }

        @Test
        void belongsToItsOwner() {
            // Both documents, because both are new doors into the same data and
            // an authorization check is only as good as its least-guarded one.
            when(meetings.findByIdAndUserId(MEETING, "usr_2")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.summaryPdf("usr_2", MEETING, null, null))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("not found");
            assertThatThrownBy(() -> service.transcriptPdf("usr_2", MEETING, null, null))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void keepsTheTwoDocumentsApart() {
            /*
             * THE CONTRACT THE OLD ENDPOINT COULD NOT STATE.
             *
             * <p>It could produce a summary, a transcript, both, or neither,
             * which is why the dialog had to ask. Each file is now one thing,
             * and neither can carry the other by accident.
             */
            assertThat(headings(summaryDoc(null).blocks()))
                    .contains("Decisions", "Action items")
                    .doesNotContain("Transcript");
            assertThat(headings(transcriptDoc(null).blocks()))
                    .contains("Transcript")
                    .doesNotContain("Decisions", "Action items");
        }

        @Test
        void writesEverySectionWithoutBeingAsked() {
            // There is no section filter any more. `options.wants(key)` used to
            // drop the ones a caller had not named, and the caller was a row of
            // checkboxes.
            assertThat(headings(summaryDoc(null).blocks()))
                    .contains("Decisions", "Budget", "Action items");
        }

        @Test
        void alwaysNamesTheSpeakerAndTheTime() {
            // Both were switches. A transcript without them is a wall of text
            // nobody can attribute or check against the recording.
            List<ExportDocument.Utterance> lines = utterances(transcriptDoc(null));

            assertThat(lines).isNotEmpty();
            assertThat(lines).allSatisfy(line -> {
                assertThat(line.speaker()).isNotBlank();
                assertThat(line.timecode()).isNotBlank();
            });
        }

        @Test
        void leavesTheBackAndForthAsItWasSpoken() {
            // `combine` is gone: one block per utterance, so two speakers are
            // two lines rather than one merged paragraph.
            assertThat(utterances(transcriptDoc(null))).hasSize(2);
        }
    }

    /* -------------------------------- audio ------------------------------- */

    @Nested
    @DisplayName("the recording")
    class Audio {

        @Test
        void isALinkNamedAfterTheMeeting() {
            when(storage.presignDownload(anyString(), anyString())).thenReturn("https://minio/signed");
            when(storage.presignExpirySeconds()).thenReturn(900L);

            AudioDownloadResponse response = service.audio(USER, MEETING);

            ArgumentCaptor<String> filename = ArgumentCaptor.forClass(String.class);
            verify(storage).presignDownload(eq("audio/mtg_1.mp3"), filename.capture());
            // Signed into the URL, because the browser fetches the object from
            // storage directly and never passes through us to be renamed.
            assertThat(filename.getValue()).isEqualTo("sprint-planning.mp3");
            assertThat(response.url()).isEqualTo("https://minio/signed");
            assertThat(response.expiresInSeconds()).isEqualTo(900L);
        }

        @Test
        void namesTheFileFromWhatWasActuallyUploaded() {
            Meeting video = meeting();
            video.setContentType("video/mp4");
            video.setObjectKey("audio/mtg_1.bin");
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(video));
            when(storage.presignDownload(anyString(), anyString())).thenReturn("https://minio/signed");

            assertThat(service.audio(USER, MEETING).filename()).isEqualTo("sprint-planning.mp4");
        }

        @Test
        void refusesAMeetingThatWasNeverARecording() {
            Meeting document = meeting();
            document.setSourceType(SourceType.DOCUMENT);
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(document));

            assertThatThrownBy(() -> service.audio(USER, MEETING))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("no recording");
            verify(storage, never()).presignDownload(anyString(), anyString());
        }

        @Test
        void refusesAMeetingWhoseAudioIsGone() {
            Meeting gone = meeting();
            gone.setObjectKey(null);
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(gone));

            assertThatThrownBy(() -> service.audio(USER, MEETING))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("no stored recording");
        }
    }

    /* --------------------------------- mp3 -------------------------------- */

    /**
     * Exporting the recording as an MP3.
     *
     * <p>The claim being defended is narrow and absolute: a file Reverie names
     * {@code .mp3} contains MP3. Renaming a webm would produce something VLC
     * plays, iTunes refuses, a car stereo skips and a phone opens as a
     * zero-second track — a file that looks fine until it is the only copy of a
     * conversation somebody needs.
     *
     * <p>The second theme is that this endpoint must not become a way around
     * erasure. A recording that has been deleted cannot be converted into a copy
     * of itself, and the test for that sits beside the ones about codecs because
     * it is the same feature.
     */
    @Nested
    @DisplayName("the recording as an mp3")
    class Mp3 {

        @BeforeEach
        void ready() {
            when(storage.presignExpirySeconds()).thenReturn(900L);
            when(storage.presignDownload(anyString(), anyString(), anyString()))
                    .thenReturn("https://minio/signed-mp3");
        }

        @Test
        void doesNotConvertARecordingThatIsAlreadyAnMp3() {
            // The fixture is audio/mpeg. Re-encoding it would spend a minute of
            // CPU to produce a second, measurably worse copy -- MP3 is lossy, so
            // a round trip through the encoder always loses something.
            AudioExportResponse response = service.audioAsMp3(USER, MEETING);

            assertThat(response.status()).isEqualTo("ready");
            verify(ai, never()).transcodeToMp3(anyString(), anyString());
            verify(storage).presignDownload(eq("audio/mtg_1.mp3"), anyString(), anyString());
        }

        @Test
        void namesItMp3AndSaysItIsAudioMpeg() {
            AudioExportResponse response = service.audioAsMp3(USER, MEETING);

            // Both, and both signed into the URL. A correct extension over a
            // response served as application/octet-stream still gets saved
            // wrongly by some browsers, and the type alone leaves the file
            // named after an object key.
            assertThat(response.filename()).isEqualTo("sprint-planning.mp3");
            assertThat(response.contentType()).isEqualTo("audio/mpeg");
            verify(storage).presignDownload(anyString(), eq("sprint-planning.mp3"), eq("audio/mpeg"));
        }

        @Test
        void reusesTheConvertedCopyRatherThanConvertingAgain() {
            webm();
            when(storage.exists("audio/mtg_1.webm.mp3")).thenReturn(true);

            AudioExportResponse response = service.audioAsMp3(USER, MEETING);

            assertThat(response.status()).isEqualTo("ready");
            assertThat(response.url()).isEqualTo("https://minio/signed-mp3");
            // The whole point of a deterministic derivative key: the second
            // export of a meeting is a HEAD and a signature.
            verify(ai, never()).transcodeToMp3(anyString(), anyString());
        }

        @Test
        void convertsAWebmAndAsksTheCallerToWait() {
            webm();
            when(storage.exists(anyString())).thenReturn(false);
            when(ai.transcodeToMp3(anyString(), anyString()))
                    .thenReturn(new AiClient.TranscodeState("running", null));

            AudioExportResponse response = service.audioAsMp3(USER, MEETING);

            assertThat(response.status()).isEqualTo("preparing");
            // No URL while preparing. One that 404s if followed would turn a
            // clear waiting state into an intermittent broken download.
            assertThat(response.url()).isNull();
            verify(ai).transcodeToMp3("audio/mtg_1.webm", "audio/mtg_1.webm.mp3");
        }

        @Test
        void startsAtMostOneConversionPerRecording() {
            // Two clicks, one after the other, before the first has finished.
            // Both reach the ai-service and the ai-service is what refuses to
            // start twice -- proven in its own tests. What matters here is that
            // the key is identical, because a key that varied per request would
            // defeat that guard from this end.
            webm();
            when(storage.exists(anyString())).thenReturn(false);
            when(ai.transcodeToMp3(anyString(), anyString()))
                    .thenReturn(new AiClient.TranscodeState("running", null));

            service.audioAsMp3(USER, MEETING);
            service.audioAsMp3(USER, MEETING);

            verify(ai, org.mockito.Mockito.times(2))
                    .transcodeToMp3("audio/mtg_1.webm", "audio/mtg_1.webm.mp3");
        }

        @Test
        void handsBackTheLinkWhenTheConversionFinishedWhileWeAsked() {
            // The object appeared between the HEAD and the call. Common, because
            // a conversion started by an earlier poll finishes during a later
            // one; making the client ask again would add two seconds to every
            // successful export.
            webm();
            when(storage.exists(anyString())).thenReturn(false);
            when(ai.transcodeToMp3(anyString(), anyString()))
                    .thenReturn(new AiClient.TranscodeState("ready", null));

            assertThat(service.audioAsMp3(USER, MEETING).status()).isEqualTo("ready");
        }

        @Test
        void passesOnAFailureAsSomethingAPersonCanRead() {
            webm();
            when(storage.exists(anyString())).thenReturn(false);
            when(ai.transcodeToMp3(anyString(), anyString())).thenReturn(
                    new AiClient.TranscodeState("failed", "This recording has no audio to convert."));

            AudioExportResponse response = service.audioAsMp3(USER, MEETING);

            assertThat(response.status()).isEqualTo("failed");
            assertThat(response.message()).isEqualTo("This recording has no audio to convert.");
        }

        @Test
        void hasSomethingToSayEvenWhenTheAiServiceDidNotWriteAMessage() {
            webm();
            when(storage.exists(anyString())).thenReturn(false);
            when(ai.transcodeToMp3(anyString(), anyString()))
                    .thenReturn(new AiClient.TranscodeState("failed", null));

            assertThat(service.audioAsMp3(USER, MEETING).message())
                    .contains("could not be converted");
        }

        @Test
        void refusesAMeetingThatWasNeverARecording() {
            Meeting document = meeting();
            document.setSourceType(SourceType.DOCUMENT);
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(document));

            assertThatThrownBy(() -> service.audioAsMp3(USER, MEETING))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("no recording");
            verify(ai, never()).transcodeToMp3(anyString(), anyString());
        }

        @Test
        void refusesAMeetingWhoseAudioHasBeenErased() {
            // The one that would matter most if it broke. Erasure is the
            // strongest promise Reverie makes, and an export path that could
            // reconstruct a deleted recording would quietly withdraw it.
            Meeting gone = meeting();
            gone.setObjectKey(null);
            gone.setAudioDeletedAt(Instant.parse("2026-08-20T10:00:00Z"));
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(gone));

            assertThatThrownBy(() -> service.audioAsMp3(USER, MEETING))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("no stored recording");
            verify(ai, never()).transcodeToMp3(anyString(), anyString());
        }

        @Test
        void mintsAFreshLinkEveryTimeItIsAsked() {
            // Presigned URLs expire. A caller that comes back an hour later --
            // a dialog left open, a retry after a failure -- gets a new
            // signature rather than the dead one, because nothing here caches.
            webm();
            when(storage.exists(anyString())).thenReturn(true);

            service.audioAsMp3(USER, MEETING);
            service.audioAsMp3(USER, MEETING);

            verify(storage, org.mockito.Mockito.times(2))
                    .presignDownload(eq("audio/mtg_1.webm.mp3"), anyString(), anyString());
        }

        /** A meeting recorded in a browser, which is the common case. */
        private void webm() {
            Meeting m = meeting();
            m.setObjectKey("audio/mtg_1.webm");
            m.setContentType("audio/webm;codecs=opus");
            when(meetings.findByIdAndUserId(MEETING, USER)).thenReturn(Optional.of(m));
        }
    }

    /* ------------------------------ fixtures ------------------------------ */

    private static Meeting meeting() {
        Meeting m = new Meeting();
        m.setId(MEETING);
        m.setUserId(USER);
        m.setTitle("Sprint planning");
        m.setLanguage("en");
        m.setObjectKey("audio/mtg_1.mp3");
        m.setContentType("audio/mpeg");
        m.setSourceType(SourceType.AUDIO);
        m.setDurationSeconds(2520);
        m.setTags(List.of("planning"));
        // 23:30 UTC, so a reader in Tokyo is already on the following day.
        m.setCreatedAt(Instant.parse("2026-08-16T23:30:00Z"));
        return m;
    }

    private static MeetingSummary summary() {
        MeetingSummary s = new MeetingSummary();
        s.setMeetingId(MEETING);
        s.setShortSummary("We agreed to move billing to Stripe.");
        s.setDetailedSummary("We agreed to move billing to Stripe.");
        s.setKeyPoints(List.of("Stripe by Q4"));
        s.setSections(List.of(
                new SummarySection("decisions", "Decisions", "bullets", "",
                        List.of("Move billing to Stripe"), List.of()),
                new SummarySection("budget", "Budget", "bullets", "", List.of(), List.of())));
        return s;
    }

    private static List<MeetingActionItem> tasks() {
        MeetingActionItem open = new MeetingActionItem();
        open.setId("ai_1");
        open.setMeetingId(MEETING);
        open.setTitle("Finish the JWT validation");
        open.setOwnerName("Priya");
        open.setDueDate("friday");
        open.setStatus("OPEN");

        MeetingActionItem done = new MeetingActionItem();
        done.setId("ai_2");
        done.setMeetingId(MEETING);
        done.setTitle("Draft the rollout plan");
        done.setOwnerName("Marcus");
        done.setStatus("DONE");
        return List.of(open, done);
    }

    private static List<TranscriptSegment> transcript() {
        return List.of(
                segment("seg_1", 0.0, "Priya", "Right, shall we start?"),
                segment("seg_2", 942.0, "Marcus", "I'll draft the rollout plan before the demo."));
    }

    private static TranscriptSegment segment(String id, double start, String speaker, String text) {
        TranscriptSegment s = new TranscriptSegment();
        s.setId(id);
        s.setMeetingId(MEETING);
        s.setStartTime(start);
        s.setSpeaker(speaker);
        s.setText(text);
        return s;
    }

    /** A translation of the brief, of one task, and of only the first utterance. */
    private static TranslationResponse spanish() {
        return new TranslationResponse(
                "es", "Spanish", false,
                "Acordamos pasar la facturación a Stripe.",
                "Acordamos pasar la facturación a Stripe.",
                List.of("Stripe para el cuarto trimestre"),
                List.of(new SummarySection("decisions", "Decisiones", "bullets", "",
                                List.of("Pasar la facturación a Stripe"), List.of()),
                        new SummarySection("budget", "Presupuesto", "bullets", "",
                                List.of(), List.of())),
                List.of(new TranslationResponse.TranslatedTaskResponse(
                        "ai_1", "Terminar la validación de JWT", "Priya", "viernes", true)),
                List.of(new TranslationResponse.TranslatedSegmentResponse("seg_1", "¿Empezamos?")),
                true, true, false, null, null);
    }

    /* ------------------------------- reading ------------------------------ */

    private static List<String> headings(List<ExportDocument.Block> blocks) {
        return blocks.stream()
                .filter(ExportDocument.Block.Heading.class::isInstance)
                .map(b -> ((ExportDocument.Block.Heading) b).text())
                .toList();
    }

    private static List<ExportDocument.Task> allTasks(ExportDocument doc) {
        return doc.blocks().stream()
                .filter(ExportDocument.Block.Tasks.class::isInstance)
                .flatMap(b -> ((ExportDocument.Block.Tasks) b).items().stream())
                .toList();
    }

    private static ExportDocument.Task firstTask(ExportDocument doc) {
        return allTasks(doc).get(0);
    }

    private static List<ExportDocument.Utterance> utterances(ExportDocument doc) {
        return doc.blocks().stream()
                .filter(ExportDocument.Block.Transcript.class::isInstance)
                .flatMap(b -> ((ExportDocument.Block.Transcript) b).lines().stream())
                .toList();
    }
}
