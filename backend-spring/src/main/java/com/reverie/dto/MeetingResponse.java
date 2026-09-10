package com.reverie.dto;

import com.reverie.domain.MeetingStatus;
import com.reverie.domain.SourceType;
import com.reverie.entity.Meeting;

import java.time.Instant;
import java.util.List;

public record MeetingResponse(
        String id,
        String title,
        MeetingStatus status,
        List<String> tags,
        String audioUrl,
        Integer durationSeconds,
        Instant createdAt,
        String errorMessage,
        /** Lets the UI drop the audio player and deep-links for text sources. */
        SourceType sourceType,
        String sourceUrl,
        /** Detected transcription language (ISO-639-1); null until processed. */
        String language,
        /**
         * The language the user told us this meeting is in, or null to use the
         * account default (V42).
         *
         * <p>Sent separately from {@link #language} because the picker has to
         * show what was *asked for* rather than what came back: those differ
         * exactly when somebody is trying to fix a mis-transcription, which is
         * the one time the control matters.
         */
        String spokenLanguage,
        /** Which summary template this meeting's notes are written in. */
        String summaryTemplate,
        /**
         * MIME type of the stored media, so the player renders a video as a
         * video. Null for pre-V16 meetings and YouTube imports; both play as
         * audio, which is what they did before this field existed.
         */
        String contentType,
        /** The project this meeting is filed under, or null for unfiled (V30). */
        String projectId,

        /**
         * When the recording was erased, or null (V35).
         *
         * <p>Sent so the page can say "you deleted this on the 3rd" instead of
         * "no audio" — which is also what it would have to say about a YouTube
         * import and about an upload still in flight. Three different situations
         * with one wrong sentence between them.
         */
        Instant audioDeletedAt,

        /** When the transcript was erased, or null. The notes outlive it. */
        Instant transcriptDeletedAt,

        /** When the person recording confirmed they had told the room, or null. */
        Instant consentConfirmedAt,

        /**
         * Which run of the pipeline this meeting is on. 1 for a meeting that has
         * never been reprocessed; incremented by {@code MeetingService.reprocess}.
         *
         * <h2>Why the client needs it</h2>
         *
         * <p>Because a reprocess leaves the previous run's transcript and
         * summary exactly where they were -- deliberately, since a run that
         * fails must not have destroyed a good transcript on its way in. So
         * while the new run is at 11%, the old artifacts are still there to be
         * fetched, and the progress card read them as evidence that *this* run
         * had produced them: "Uploaded, Transcript, Speakers, Summary", all
         * four ticked, above a bar that had barely moved.
         *
         * <p>This is the same fact {@code translations.markStaleByMeetingId}
         * acts on at the other end of that method, and for the same reason
         * stated there: from the moment a reprocess is requested, nobody should
         * read what is on the page as current.
         *
         * <p>Sent rather than derived because it is already the identity every
         * stale-callback check in the system uses (V57). A client guessing at
         * it -- "a summary exists but the status is TRANSCRIBING, so this must
         * be a reprocess" -- would be inferring a run boundary the server
         * already knows.
         */
        int processingAttempt
) {
    public static MeetingResponse from(Meeting m) {
        return new MeetingResponse(
                m.getId(),
                m.getTitle(),
                m.getStatus(),
                m.getTags(),
                m.getAudioUrl(),
                m.getDurationSeconds(),
                m.getCreatedAt(),
                m.getErrorMessage(),
                m.getSourceType(),
                m.getSourceUrl(),
                m.getLanguage(),
                m.getSpokenLanguage(),
                m.getSummaryTemplate(),
                m.getContentType(),
                m.getProjectId(),
                m.getAudioDeletedAt(),
                m.getTranscriptDeletedAt(),
                m.getConsentConfirmedAt(),
                m.getProcessingAttempt()
        );
    }
}
