package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.domain.Language;
import com.reverie.domain.SourceType;
import com.reverie.domain.SummarySection;
import com.reverie.dto.AudioDownloadResponse;
import com.reverie.dto.AudioExportResponse;
import com.reverie.dto.TranslationResponse;
import com.reverie.entity.Meeting;
import com.reverie.entity.MeetingActionItem;
import com.reverie.entity.MeetingSummary;
import com.reverie.entity.TranscriptSegment;
import com.reverie.export.AudioDerivatives;
import com.reverie.export.Downloads;
import com.reverie.export.PdfRenderer;
import com.reverie.export.ExportDocument;
import com.reverie.export.ExportFile;
import com.reverie.export.ExportLabels;
import com.reverie.repository.MeetingActionItemRepository;
import com.reverie.repository.MeetingRepository;
import com.reverie.repository.MeetingSummaryRepository;
import com.reverie.repository.TranscriptSegmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * A meeting, as a file.
 *
 * <p>All the deciding happens here and none of it happens in the renderers:
 * which parts of the meeting go in, what the empty ones say, how a deadline
 * reads beside its owner, what the file is called. The renderers are handed a
 * finished {@link ExportDocument} and only decide how to draw it — which is what
 * keeps the PDF and the plain text saying the same thing about the same meeting.
 *
 * <p><strong>Exporting a translation does not translate anything.</strong> A
 * download is a GET and a model call is not free, so asking for a language the
 * meeting has not been translated into is a 404 pointing at the endpoint that
 * would do it, not a five-second wait and a surprise on the bill. In practice
 * the reader has already switched the page into that language, which is what
 * created it.
 *
 * <p><strong>The transcript is opt-in.</strong> It is ten to a hundred times the
 * length of everything else, and somebody exporting a PDF to attach to an email
 * usually wants the two pages, not the forty.
 */
@Service
public class ExportService {

    private static final Logger log = LoggerFactory.getLogger(ExportService.class);

    private final MeetingRepository meetings;
    private final MeetingSummaryRepository summaries;
    private final MeetingActionItemRepository actionItems;
    private final TranscriptSegmentRepository segments;
    private final TranslationService translations;
    private final StorageService storage;
    private final AiClient ai;
    /**
     * One renderer, held directly.
     *
     * <p>This was a {@code Map<ExportFormat, DocumentRenderer>} populated from
     * an injected list, which is the right shape for four formats and pure
     * ceremony for one: an enum with a single constant, an interface with a
     * single implementation, a lookup that cannot miss, and a
     * "no renderer for PDF" branch that could never run. Reverie exports PDF.
     */
    private final PdfRenderer pdf;

    public ExportService(MeetingRepository meetings,
                         MeetingSummaryRepository summaries,
                         MeetingActionItemRepository actionItems,
                         TranscriptSegmentRepository segments,
                         TranslationService translations,
                         StorageService storage,
                         AiClient ai,
                         PdfRenderer pdf) {
        this.meetings = meetings;
        this.summaries = summaries;
        this.actionItems = actionItems;
        this.segments = segments;
        this.translations = translations;
        this.storage = storage;
        this.ai = ai;
        this.pdf = pdf;
    }

    /**
     * Which of the two documents a meeting can be taken out as.
     *
     * <p>Not a set of flags. The two are different documents with different
     * readers -- a summary somebody attaches to a reply, a transcript somebody
     * searches -- and every combination the old option object allowed was
     * either one of these two or a file nobody asked for.
     */
    private enum Part { SUMMARY, TRANSCRIPT }

    /**
     * The complete summary, as a PDF.
     *
     * <p>Complete is the contract: every section the template wrote, in the
     * order it wrote them, plus what people agreed to do. There is no section
     * filter any more -- the old endpoint took a comma-separated list of keys,
     * and a reader choosing which parts of a summary to keep was configuration
     * standing in for an editor.
     *
     * @param rawLanguage a language the meeting has already been translated
     *                    into, or null for the meeting's own words
     * @param zone        the reader's time zone, so the date on the document is
     *                    the date they saw in the app; UTC when unparseable
     */
    @Transactional(readOnly = true)
    public ExportFile summaryPdf(String userId, String meetingId, String rawLanguage, String zone) {
        return render(userId, meetingId, Part.SUMMARY, "summary", rawLanguage, zone);
    }

    /**
     * The whole transcript, as a PDF, with who said it and when.
     *
     * <p>Both were switches and neither is now. A transcript without speakers
     * is a wall of text nobody can attribute, and one without timestamps
     * cannot be checked against the recording -- which are the two things a
     * transcript is for. The old {@code combine} modes are gone with them: the
     * utterances come out as they were spoken.
     */
    @Transactional(readOnly = true)
    public ExportFile transcriptPdf(String userId, String meetingId,
                                    String rawLanguage, String zone) {
        return render(userId, meetingId, Part.TRANSCRIPT, "transcript", rawLanguage, zone);
    }

    private ExportFile render(String userId, String meetingId, Part part,
                              String suffix, String rawLanguage, String zone) {
        // Ownership first, and by the same query as before: a meeting that is
        // not this user's is not found rather than forbidden, so the endpoint
        // cannot be used to discover which ids exist.
        Meeting meeting = meetings.findByIdAndUserId(meetingId, userId)
                .orElseThrow(() -> ApiException.notFound("Meeting not found"));

        TranslationResponse translation = rawLanguage == null || rawLanguage.isBlank()
                ? null
                : translations.get(userId, meetingId, rawLanguage);

        ExportDocument document = assemble(meeting, translation, part, zoneOf(zone));
        // `product-weekly-summary.pdf`, not `product-weekly.pdf`. Two documents
        // come out of one meeting now, and a reader who downloads both wants to
        // be able to tell them apart in a downloads folder.
        String filename = Downloads.slug(meeting.getTitle()) + "-" + suffix + ".pdf";
        return new ExportFile(filename, "application/pdf", pdf.render(document));
    }

    /**
     * A link to the recording itself, named after the meeting.
     *
     * <p>Presigned rather than proxied through the API: the file is tens or
     * hundreds of megabytes, and streaming it through a request thread to add
     * nothing to it would be a denial-of-service tool with a login. The
     * disposition is signed into the URL, which is what makes the browser save
     * {@code sprint-planning.mp3} rather than open an object key.
     */
    @Transactional(readOnly = true)
    public AudioDownloadResponse audio(String userId, String meetingId) {
        Meeting meeting = meetings.findByIdAndUserId(meetingId, userId)
                .orElseThrow(() -> ApiException.notFound("Meeting not found"));

        if (meeting.getSourceType() == SourceType.DOCUMENT) {
            throw ApiException.badRequest("This meeting was imported from a document, so there is no recording.");
        }
        if (meeting.getObjectKey() == null || meeting.getObjectKey().isBlank()) {
            throw ApiException.notFound("This meeting has no stored recording.");
        }

        String filename = Downloads.slug(meeting.getTitle())
                + mediaExtension(meeting.getContentType(), meeting.getObjectKey());
        return new AudioDownloadResponse(
                storage.presignDownload(meeting.getObjectKey(), filename),
                filename,
                meeting.getContentType(),
                storage.presignExpirySeconds());
    }

    /**
     * The recording as an actual MP3, converting it once if it is not one.
     *
     * <h2>Why this is a poll and not a download</h2>
     *
     * <p>Because converting an hour of audio takes tens of seconds and a request
     * that waited for it would be cut off by a proxy before it finished — after
     * doing all the work. So this answers straight away with
     * {@code preparing}, and the client asks again. Three calls with nothing to
     * do cost three HEAD requests; one call that waits costs a user their
     * export.
     *
     * <h2>What makes it idempotent</h2>
     *
     * <p>The derivative's key is derived from the source key
     * ({@link AudioDerivatives}), so this method holds no state and needs none.
     * "Is it converted?" is a HEAD against the bucket. A second click during a
     * conversion finds the same key already in flight in the ai-service and
     * starts nothing. A click a month later finds the object and presigns it —
     * which is also what makes this work for meetings recorded long before the
     * feature existed: there is no backfill, only a first export that is slower
     * than the second.
     *
     * <h2>What it refuses</h2>
     *
     * <p>Exactly what {@link #audio} refuses, and for the same reasons — a
     * meeting imported as a document never had a recording, and one whose audio
     * has been erased must not be able to produce a copy of it. That second case
     * is the important one: a privacy control that can be undone by an export
     * button is not a privacy control.
     *
     * <p>Deliberately not {@code @Transactional}, unlike everything else here.
     * It makes an HTTP call to the ai-service, and a transaction wrapped around
     * that holds a database connection for the length of somebody else's
     * network. The call is short — it starts work rather than waiting for it —
     * but "short" is a property of the ai-service being healthy, and the
     * connection pool is shared with every other request in the application.
     * The repository read below gets its own transaction; nothing after it
     * needs one, since only mapped columns are touched.
     */
    public AudioExportResponse audioAsMp3(String userId, String meetingId) {
        Meeting meeting = meetings.findByIdAndUserId(meetingId, userId)
                .orElseThrow(() -> {
                    // Logged, and only here, because this is the one 404 in the
                    // export paths that has been hard to tell apart from a
                    // deployment problem. "Meeting not found" is written by this
                    // line and nowhere else; a request that reached a build with
                    // no /audio/mp3 route gets "Not found" from
                    // GlobalExceptionHandler instead, and one with no session
                    // gets "Authentication required". So the presence or absence
                    // of this line in the log settles which of the three
                    // happened, without anyone having to reason about it.
                    log.warn("MP3 export: meeting {} is not the caller's, or does not exist.",
                            meetingId);
                    return ApiException.notFound("Meeting not found");
                });

        if (meeting.getSourceType() == SourceType.DOCUMENT) {
            throw ApiException.badRequest("This meeting was imported from a document, so there is no recording.");
        }
        String source = meeting.getObjectKey();
        if (source == null || source.isBlank()) {
            throw ApiException.notFound("This meeting has no stored recording.");
        }

        String filename = Downloads.slug(meeting.getTitle()) + ".mp3";

        // Already an MP3. Converting it would spend a minute of CPU to produce a
        // second, slightly worse copy of a file we are holding -- re-encoding a
        // lossy format always loses something -- so this presigns the original.
        if (AudioDerivatives.isMp3(meeting.getContentType(), source)) {
            return AudioExportResponse.ready(
                    storage.presignDownload(source, filename, MP3_TYPE),
                    filename, MP3_TYPE, storage.presignExpirySeconds());
        }

        String derivative = AudioDerivatives.mp3Key(source);
        if (storage.exists(derivative)) {
            return AudioExportResponse.ready(
                    storage.presignDownload(derivative, filename, MP3_TYPE),
                    filename, MP3_TYPE, storage.presignExpirySeconds());
        }

        AiClient.TranscodeState state = ai.transcodeToMp3(source, derivative);
        if (state.failed()) {
            return AudioExportResponse.failed(state.message() == null || state.message().isBlank()
                    ? "The audio could not be converted just now. Try again in a moment."
                    : state.message());
        }
        if (state.ready()) {
            // It finished between the HEAD above and the call -- a short window,
            // and one a long-running conversion started by an earlier poll lands
            // in constantly. Presigned here rather than made the client ask
            // again, because it is ready and there is nothing to wait for.
            return AudioExportResponse.ready(
                    storage.presignDownload(derivative, filename, MP3_TYPE),
                    filename, MP3_TYPE, storage.presignExpirySeconds());
        }
        return AudioExportResponse.preparing();
    }

    /** What an MP3 is, spelled the one way every browser and player agrees on. */
    private static final String MP3_TYPE = "audio/mpeg";

    /* ------------------------------ assembly ------------------------------ */

    private ExportDocument assemble(Meeting meeting, TranslationResponse translation,
                                    Part part, ZoneId zone) {
        Language language = translation != null
                ? Language.find(translation.language()).orElse(null)
                : Language.find(meeting.getLanguage()).orElse(null);
        ExportLabels labels = ExportLabels.of(language);
        Locale locale = language == null ? Locale.ENGLISH : Locale.forLanguageTag(language.code());

        MeetingSummary summary = summaries.findFirstByMeetingIdOrderByCreatedAtDesc(meeting.getId())
                .orElse(null);
        List<MeetingActionItem> tasks = actionItems.findByMeetingId(meeting.getId());

        /*
         * Each document is only itself.
         *
         * <p>The old endpoint could produce any combination, including a
         * summary with a transcript appended -- which is why the frontend had
         * to offer checkboxes to say which. Two files means neither can
         * accidentally carry the other, and the tests assert exactly that.
         */
        List<ExportDocument.Block> blocks = new ArrayList<>();
        if (part == Part.SUMMARY) {
            blocks.addAll(summaryBlocks(summary, translation, labels));
            blocks.addAll(taskBlocks(tasks, translation, labels));
        } else {
            blocks.addAll(transcriptBlocks(meeting.getId(), translation, labels));
        }

        return new ExportDocument(
                meeting.getTitle(),
                meta(meeting, zone, locale),
                notice(meeting, translation),
                language,
                blocks);
    }

    /**
     * The brief.
     *
     * <p>An empty section keeps its heading and gains a line saying it was not
     * discussed. Dropping it would leave the reader unable to tell a subject
     * that never came up from a template that never asked about it, and in a
     * file — which is a record rather than a screen — that difference is the
     * whole reason somebody kept the file.
     */
    private List<ExportDocument.Block> summaryBlocks(MeetingSummary summary,
                                                     TranslationResponse translation,
                                                     ExportLabels labels) {
        List<SummarySection> sections = translation != null
                ? orEmpty(translation.sections())
                : (summary == null ? List.of() : orEmpty(summary.getSections()));

        List<ExportDocument.Block> blocks = new ArrayList<>();
        if (!sections.isEmpty()) {
            for (SummarySection section : sections) {
                // Every section, unconditionally. `options.wants(key)` used to
                // stand here and drop the ones a caller had not named.
                blocks.add(new ExportDocument.Block.Heading(1, section.title()));
                switch (section.kind() == null ? "" : section.kind()) {
                    case "prose" -> blocks.add(section.text() == null || section.text().isBlank()
                            ? new ExportDocument.Block.Aside(labels.notDiscussed())
                            : new ExportDocument.Block.Prose(section.text().strip()));
                    case "outline" -> {
                        if (section.groupsOrEmpty().isEmpty()) {
                            blocks.add(new ExportDocument.Block.Aside(labels.notDiscussed()));
                        }
                        for (SummarySection.OutlineGroup group : section.groupsOrEmpty()) {
                            blocks.add(new ExportDocument.Block.Heading(2, group.heading()));
                            blocks.add(new ExportDocument.Block.Bullets(group.bulletsOrEmpty()));
                        }
                    }
                    default -> blocks.add(section.bulletsOrEmpty().isEmpty()
                            ? new ExportDocument.Block.Aside(labels.notDiscussed())
                            : new ExportDocument.Block.Bullets(section.bulletsOrEmpty()));
                }
            }
            return blocks;
        }

        // No template: the flat summary, which is all a pre-template meeting has.
        String shortSummary = translation != null ? translation.shortSummary()
                : (summary == null ? null : summary.getShortSummary());
        String detailed = translation != null ? translation.detailedSummary()
                : (summary == null ? null : summary.getDetailedSummary());
        List<String> keyPoints = translation != null ? orEmpty(translation.keyPoints())
                : (summary == null ? List.of() : orEmpty(summary.getKeyPoints()));

        if (shortSummary != null && !shortSummary.isBlank()) {
            blocks.add(new ExportDocument.Block.Heading(1, labels.summary()));
            blocks.add(new ExportDocument.Block.Prose(shortSummary.strip()));
        }
        if (detailed != null && !detailed.isBlank() && !detailed.equals(shortSummary)) {
            blocks.add(new ExportDocument.Block.Prose(detailed.strip()));
        }
        if (!keyPoints.isEmpty()) {
            blocks.add(new ExportDocument.Block.Heading(1, labels.keyPoints()));
            blocks.add(new ExportDocument.Block.Bullets(keyPoints));
        }
        return blocks;
    }

    /**
     * The action items, in the language being read.
     *
     * <p>The owner and the deadline are joined here rather than in each
     * renderer. The deadline keeps the words that were said — "before the demo"
     * is what somebody committed to, and a file that silently replaced it with a
     * date would be putting a promise in their mouth they never made.
     */
    private List<ExportDocument.Block> taskBlocks(List<MeetingActionItem> tasks,
                                                  TranslationResponse translation,
                                                  ExportLabels labels) {
        if (tasks.isEmpty()) {
            return List.of();
        }
        Map<String, TranslationResponse.TranslatedTaskResponse> translated = translation == null
                ? Map.of()
                : orEmpty(translation.actionItems()).stream()
                        .collect(Collectors.toMap(TranslationResponse.TranslatedTaskResponse::id,
                                Function.identity(), (a, b) -> a, HashMap::new));

        List<ExportDocument.Task> items = new ArrayList<>(tasks.size());
        for (MeetingActionItem task : tasks) {
            TranslationResponse.TranslatedTaskResponse t = translated.get(task.getId());
            String title = t == null ? task.getTitle() : t.title();
            String due = t == null ? task.getDueDate() : t.dueDate();

            List<String> detail = new ArrayList<>(2);
            if (notBlank(task.getOwnerName())) {
                detail.add(task.getOwnerName());
            }
            if (notBlank(due)) {
                detail.add("due " + due);
            }
            items.add(new ExportDocument.Task(task.isDone(), title, String.join(" · ", detail)));
        }
        return List.of(new ExportDocument.Block.Heading(1, labels.actionItems()),
                new ExportDocument.Block.Tasks(items));
    }

    /**
     * The transcript.
     *
     * <p>Timing and speaker come from the live segments even when a translation
     * is being read, and only the words come from the translation: a speaker
     * renamed after the meeting was translated is renamed in every language at
     * once rather than in none of them. A line recorded since the translation
     * was made is exported in the original, because a gap in a transcript reads
     * as a silence in the room.
     */
    private List<ExportDocument.Block> transcriptBlocks(String meetingId,
                                                        TranslationResponse translation,
                                                        ExportLabels labels) {
        List<TranscriptSegment> lines = segments.findByMeetingIdOrderByStartTimeAsc(meetingId);
        if (lines.isEmpty()) {
            return List.of();
        }
        Map<String, String> words = translation == null
                ? Map.of()
                : orEmpty(translation.segments()).stream()
                        .collect(Collectors.toMap(TranslationResponse.TranslatedSegmentResponse::id,
                                TranslationResponse.TranslatedSegmentResponse::text,
                                (a, b) -> a, HashMap::new));

        List<ExportDocument.Utterance> utterances = new ArrayList<>(lines.size());
        for (TranscriptSegment line : lines) {
            String speaker = line.getSpeaker() == null || line.getSpeaker().isBlank()
                    ? "Speaker" : line.getSpeaker();
            String text = words.getOrDefault(
                    line.getId(), line.getText() == null ? "" : line.getText());
            // Both always filled. They were suppressible by emptying the
            // field, which is how a "transcript" with no names and no times
            // used to be reachable.
            utterances.add(new ExportDocument.Utterance(
                    timecode(line.getStartTime()), speaker, text));
        }

        return List.of(new ExportDocument.Block.Heading(1, labels.transcript()),
                new ExportDocument.Block.Transcript(utterances));
    }

    /* ------------------------------- details ------------------------------ */

    private static List<String> meta(Meeting meeting, ZoneId zone, Locale locale) {
        List<String> meta = new ArrayList<>(3);
        if (meeting.getCreatedAt() != null) {
            meta.add(DateTimeFormatter
                    .ofLocalizedDateTime(FormatStyle.LONG, FormatStyle.SHORT)
                    .withLocale(locale)
                    .withZone(zone)
                    .format(meeting.getCreatedAt()));
        }
        if (meeting.getDurationSeconds() != null && meeting.getDurationSeconds() > 0) {
            meta.add(length(meeting.getDurationSeconds()));
        }
        if (meeting.getTags() != null && !meeting.getTags().isEmpty()) {
            meta.add(String.join(", ", meeting.getTags()));
        }
        return meta;
    }

    /**
     * The line that keeps a translated export honest.
     *
     * <p>Left in English on purpose. It is a note from Reverie about the
     * document rather than part of the meeting, and somebody who has forgotten
     * they are reading a translation is exactly the person who is about to quote
     * a translated sentence as a thing that was said aloud.
     */
    private static String notice(Meeting meeting, TranslationResponse translation) {
        if (translation == null) {
            return null;
        }
        String source = Language.find(meeting.getLanguage())
                .map(Language::englishName)
                .orElse(null);
        return "Translated into " + translation.languageName()
                + (source == null ? "." : ". The recording is in " + source + ".");
    }

    private static String length(int seconds) {
        int minutes = Math.round(seconds / 60f);
        return minutes < 60 ? minutes + " min" : (minutes / 60) + "h " + (minutes % 60) + "m";
    }

    private static String timecode(Double start) {
        int total = start == null ? 0 : (int) Math.floor(start);
        int hours = total / 3600;
        int minutes = (total % 3600) / 60;
        int secs = total % 60;
        return hours > 0
                ? String.format("%d:%02d:%02d", hours, minutes, secs)
                : String.format("%d:%02d", minutes, secs);
    }

    /** The reader's zone, or UTC — a bad one is not worth failing a download over. */
    private static ZoneId zoneOf(String zone) {
        if (zone == null || zone.isBlank()) {
            return ZoneOffset.UTC;
        }
        try {
            return ZoneId.of(zone.trim());
        } catch (DateTimeException e) {
            return ZoneOffset.UTC;
        }
    }

    /** {@code .mp3}, from what was declared on upload or failing that the key. */
    private static String mediaExtension(String contentType, String objectKey) {
        String type = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).split(";")[0].trim();
        String known = switch (type) {
            case "audio/mpeg", "audio/mp3" -> ".mp3";
            case "audio/wav", "audio/x-wav", "audio/wave" -> ".wav";
            case "audio/mp4", "audio/x-m4a" -> ".m4a";
            case "audio/aac" -> ".aac";
            case "audio/ogg", "audio/opus" -> ".ogg";
            case "audio/flac", "audio/x-flac" -> ".flac";
            case "audio/webm" -> ".webm";
            case "video/mp4" -> ".mp4";
            case "video/webm" -> ".webm";
            case "video/quicktime" -> ".mov";
            default -> "";
        };
        if (!known.isEmpty()) {
            return known;
        }
        int dot = objectKey.lastIndexOf('.');
        String fromKey = dot < 0 ? "" : objectKey.substring(dot).toLowerCase(Locale.ROOT);
        return fromKey.matches("\\.[a-z0-9]{2,5}") ? fromKey : ".audio";
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
