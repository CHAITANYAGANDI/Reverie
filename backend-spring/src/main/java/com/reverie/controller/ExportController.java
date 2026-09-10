package com.reverie.controller;

import com.reverie.dto.AudioDownloadResponse;
import com.reverie.dto.AudioExportResponse;
import com.reverie.export.Downloads;
import com.reverie.export.ExportFile;
import com.reverie.security.SecurityUtils;
import com.reverie.service.ExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Taking a meeting out of Reverie: three things, in three fixed formats.
 *
 * <p>There was one endpoint here taking eleven query parameters — a format from
 * four, which of the summary's sections by key, whether to include the action
 * items, whether to append the transcript, whether to label it with speakers,
 * whether to label it with times, and how much of the back-and-forth to flatten.
 * Every one of those was a question the product asked instead of answering, and
 * between them they described several hundred documents, of which people wanted
 * three.
 *
 * <p>So: the summary as a PDF, the transcript as a PDF, the recording as an
 * MP3. Each is its own endpoint because each is its own document, and none of
 * them takes an option that changes what is in it. What is left on the query
 * string is the two things that are about the <em>reader</em> rather than about
 * the document — which language they are reading in, and what time zone they
 * are in — and those were never choices about content.
 */
@RestController
@RequestMapping("/api/v1/meetings/{id}")
public class ExportController {

    private final ExportService exports;

    public ExportController(ExportService exports) {
        this.exports = exports;
    }

    /**
     * The complete summary, as a PDF.
     *
     * <p>Complete without being asked: every section the template wrote, in the
     * order it wrote them, and what people agreed to do. It carries no
     * transcript — that is the endpoint below.
     *
     * @param language read it in a language the meeting has already been translated into
     * @param tz       the reader's IANA time zone, so the date matches the app's
     */
    @GetMapping("/export/summary")
    public ResponseEntity<byte[]> summary(@PathVariable String id,
                                          @RequestParam(required = false) String language,
                                          @RequestParam(required = false) String tz) {
        return file(exports.summaryPdf(SecurityUtils.currentUserId(), id, language, tz));
    }

    /**
     * The whole transcript, as a PDF, with who said it and when.
     *
     * <p>Speakers and timestamps are the contract rather than parameters: a
     * transcript without them is a wall of text nobody can attribute or check
     * against the recording. It carries no summary.
     */
    @GetMapping("/export/transcript")
    public ResponseEntity<byte[]> transcript(@PathVariable String id,
                                             @RequestParam(required = false) String language,
                                             @RequestParam(required = false) String tz) {
        return file(exports.transcriptPdf(SecurityUtils.currentUserId(), id, language, tz));
    }

    /** The same headers for both documents, so they cannot drift apart. */
    private static ResponseEntity<byte[]> file(ExportFile file) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, file.mediaType())
                .header(HttpHeaders.CONTENT_DISPOSITION, Downloads.attachment(file.filename()))
                // Rendered from live data — a summary corrected a minute ago has
                // to be in the next download, not in the one after it.
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(file.content());
    }

    /** A short-lived link to the original recording, named after the meeting. */
    @GetMapping("/audio")
    public AudioDownloadResponse audio(@PathVariable String id) {
        return exports.audio(SecurityUtils.currentUserId(), id);
    }

    /**
     * The recording as an MP3 — the same link when it is already one, a
     * converted copy when it is not.
     *
     * <p>Its own path rather than {@code /audio?format=mp3} because it does not
     * behave like {@code /audio}. That endpoint always answers with a link; this
     * one may answer "not yet, ask again", and a caller that reads the two as
     * one shape will eventually follow a null URL. Keeping them separate also
     * keeps {@code /audio} exactly as it was for everything already using it.
     *
     * <p>A GET, and safe to repeat: it starts a conversion at most once for a
     * given recording, and every call after that is a HEAD and a signature.
     */
    @GetMapping("/audio/mp3")
    public AudioExportResponse audioAsMp3(@PathVariable String id) {
        return exports.audioAsMp3(SecurityUtils.currentUserId(), id);
    }
}
