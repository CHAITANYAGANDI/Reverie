package com.reverie.export;

import com.reverie.domain.Language;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfDictionary;
import org.openpdf.text.pdf.PdfName;
import org.openpdf.text.pdf.PdfObject;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

/**
 * The one file a meeting can leave as.
 *
 * <p>There were four — PDF, DOCX, Markdown and plain text — and the first group
 * here was the contract all of them shared, run against each. Three of them
 * had no consumer: nothing outside the meeting's own export dialog ever asked
 * for them, there is no account-wide data export, and no internal job renders
 * a document. So the product contract is PDF, and their renderers and their
 * half of this file went with them.
 *
 * <p>What is left is the contract — the title, the sections, the tasks and the
 * transcript have to be in the file, and a format that quietly drops one is
 * worse than one that fails, because the person holding it cannot tell — and
 * then the things only a PDF can get wrong: no font for the script it is
 * setting, or a document that runs off the end of a page.
 */
class PdfRendererTest {

    private static final PdfRenderer PDF = new PdfRenderer(new PdfFonts());

    /* ----------------------------- the contract ----------------------------- */

    @Test
    void writesTheWholeMeeting() throws Exception {
        String text = readable(PDF.render(sample(Language.ENGLISH)));

        assertThat(text)
                .contains("Sprint planning")
                .contains("Move billing to Stripe")
                .contains("Finish the JWT validation")
                .contains("Priya")
                .contains("Right, shall we start?");
    }

    @Test
    void keepsASectionTheMeetingNeverReached() throws Exception {
        String text = readable(PDF.render(sample(Language.ENGLISH)));

        // The heading is the information: "Budget" with nothing under it says
        // budget never came up, which is not the same as a template that never
        // asked about budget.
        assertThat(text).contains("Budget").contains("Not discussed");
    }

    @Test
    void saysWhichTasksAreDone() throws Exception {
        String text = readable(PDF.render(sample(Language.ENGLISH)));

        // An export is a working list, not a record of one. A file that shows
        // six things to do when two are finished is a file that gets acted on.
        assertThat(text).contains("[x]").contains("[ ]");
    }

    @Test
    void producesAFileForEveryScriptTheProductWorksIn() {
        for (Language language : Language.all()) {
            byte[] file = PDF.render(sample(language));

            // Not a smoke test: a PDF has to carry a font for the script it is
            // setting, and the failure without one is an exception here or four
            // thousand empty boxes for the reader.
            assertThat(file).as("PDF in %s", language.englishName()).isNotEmpty();
        }
    }

    /* --------------------------------- PDF --------------------------------- */

    @Nested
    @DisplayName("PDF")
    class Pdf {

        @Test
        void isAPdf() {
            assertThat(new String(PDF.render(sample(Language.ENGLISH)), 0, 5, StandardCharsets.ISO_8859_1))
                    .isEqualTo("%PDF-");
        }

        @Test
        void setsJapaneseAgainstTheAdobeCollectionTheReaderResolves() throws IOException {
            byte[] file = PDF.render(japanese());

            // Japanese is not embedded — that is the whole reason this repository
            // does not carry a sixteen-megabyte font — so what has to be right is
            // the reference: the character collection and the encoding are what a
            // reader uses to find its own glyphs. Get either wrong and the file
            // opens to a page of nothing with no error anywhere.
            assertThat(fontsOnFirstPage(file))
                    .contains(entry("HeiseiKakuGo-W5-UniJIS-UCS2-H", "UniJIS-UCS2-H"));
        }

        @Test
        void embedsALatinFontAlongsideItForTheWordsThatAreNotJapanese() throws IOException {
            // The same page carries a subset of Noto Sans, which is what renders
            // "Stripe" in the middle of a Japanese bullet. Without it the CID
            // font would be asked for Latin it may not have.
            assertThat(fontsOnFirstPage(PDF.render(japanese())).values()).contains("Identity-H");
        }

        @Test
        void putsTheJapaneseWordsInThePage() throws IOException {
            byte[] file = PDF.render(japanese());

            // UniJIS-UCS2-H is indexed by the Unicode code point itself, so the
            // content stream carries the characters as UTF-16 — which is also
            // what makes them checkable without a font to render them with.
            PdfReader reader = new PdfReader(file);
            String page = new String(reader.getPageContent(1), StandardCharsets.ISO_8859_1);
            String utf16 = new String("四半期レビュー".getBytes(StandardCharsets.UTF_16BE),
                    StandardCharsets.ISO_8859_1);
            assertThat(page).contains(utf16);
        }

        @Test
        void setsArabicInAFontThatHasArabic() throws IOException {
            String text = pdfText(PDF.render(arabic()));

            assertThat(text).contains("اجتماع");
        }

        @Test
        void findsLatinWordsInsideAScriptWithNoLatinInIt() throws IOException {
            // Noto Sans Arabic has no letter A. Without the fallback every
            // product name and every person's name in an Arabic export would be
            // a run of blanks.
            String text = pdfText(PDF.render(arabic()));

            assertThat(text).contains("Stripe");
        }

        @Test
        void runsToMorePagesWhenThereIsMoreToSay() throws IOException {
            List<ExportDocument.Utterance> many = new ArrayList<>();
            for (int i = 0; i < 200; i++) {
                many.add(new ExportDocument.Utterance("0:" + String.format("%02d", i % 60), "Priya",
                        "We should probably talk about the billing migration again."));
            }
            byte[] file = PDF.render(new ExportDocument("Long one", List.of(), null, Language.ENGLISH,
                    List.of(new ExportDocument.Block.Transcript(many))));

            PdfReader reader = new PdfReader(file);
            assertThat(reader.getNumberOfPages()).isGreaterThan(1);
        }
    }

    /* ------------------------------- fixtures ------------------------------ */

    /**
     * A meeting with one of everything: a bulleted section, an outline, a
     * section nobody reached, two tasks in different states, and a transcript.
     */
    private static ExportDocument sample(Language language) {
        return new ExportDocument(
                "Sprint planning",
                List.of("16 August 2026 at 10:04", "42 min"),
                null,
                language,
                List.of(
                        new ExportDocument.Block.Heading(1, "Decisions"),
                        new ExportDocument.Block.Bullets(List.of("Move billing to Stripe")),
                        new ExportDocument.Block.Heading(1, "Walkthrough"),
                        new ExportDocument.Block.Heading(2, "Billing"),
                        new ExportDocument.Block.Bullets(List.of("Stripe won on fees")),
                        new ExportDocument.Block.Heading(1, "Budget"),
                        new ExportDocument.Block.Aside("Not discussed."),
                        new ExportDocument.Block.Heading(1, "Action items"),
                        new ExportDocument.Block.Tasks(List.of(
                                new ExportDocument.Task(false, "Finish the JWT validation",
                                        "Priya · due friday · high"),
                                new ExportDocument.Task(true, "Draft the rollout plan",
                                        "Marcus · due before the demo"))),
                        new ExportDocument.Block.Heading(1, "Transcript"),
                        new ExportDocument.Block.Transcript(List.of(
                                new ExportDocument.Utterance("0:00", "Priya", "Right, shall we start?"),
                                new ExportDocument.Utterance("15:42", "Marcus",
                                        "I'll draft the rollout plan before the demo.")))));
    }

    private static ExportDocument japanese() {
        return new ExportDocument("四半期レビュー", List.of("42分"), null, Language.JAPANESE,
                List.of(new ExportDocument.Block.Heading(1, "要点"),
                        new ExportDocument.Block.Bullets(List.of("請求をStripeに移行する"))));
    }

    private static ExportDocument arabic() {
        return new ExportDocument("اجتماع التخطيط", List.of("42 دقيقة"),
                "Translated into Arabic.", Language.ARABIC,
                List.of(new ExportDocument.Block.Heading(1, "القرارات"),
                        new ExportDocument.Block.Bullets(List.of("نقل الفوترة إلى Stripe"))));
    }

    /* -------------------------------- reading ------------------------------ */

    /** Whatever the format, as text a test can make assertions about. */
    private static String readable(byte[] file) throws Exception {
        return pdfText(file);
    }

    /** Each font the first page uses, as base name to encoding. */
    private static Map<String, String> fontsOnFirstPage(byte[] file) throws IOException {
        PdfReader reader = new PdfReader(file);
        PdfDictionary fonts = reader.getPageN(1)
                .getAsDict(PdfName.RESOURCES)
                .getAsDict(PdfName.FONT);
        Map<String, String> used = new HashMap<>();
        for (PdfName key : fonts.getKeys()) {
            PdfDictionary font = fonts.getAsDict(key);
            PdfObject base = font.get(PdfName.BASEFONT);
            PdfObject encoding = font.get(PdfName.ENCODING);
            used.put(base == null ? "?" : PdfName.decodeName(base.toString()),
                    encoding == null ? "" : PdfName.decodeName(encoding.toString()));
        }
        return used;
    }

    private static String pdfText(byte[] file) throws IOException {
        PdfReader reader = new PdfReader(file);
        PdfTextExtractor extractor = new PdfTextExtractor(reader);
        StringBuilder out = new StringBuilder();
        for (int page = 1; page <= reader.getNumberOfPages(); page++) {
            out.append(extractor.getTextFromPage(page)).append('\n');
        }
        return out.toString();
    }
}
