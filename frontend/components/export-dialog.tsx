"use client";

/**
 * Taking a meeting away: three switches, and no questions.
 *
 * <h2>What this used to ask</h2>
 *
 * <p>A format for the summary from four. Which of the summary's sections, one
 * checkbox each. Whether to include the action items. A format for the
 * transcript from four. Whether to label it with speakers. Whether to label it
 * with timestamps. Whether to merge consecutive utterances by the same speaker,
 * or all of them into one block. And a live preview of the result in a second
 * column, with its own tabs.
 *
 * <p>Between them those described several hundred documents, of which people
 * wanted three: the summary, the transcript, the recording. Every other
 * combination was either one of those three or a file somebody had to fix
 * afterwards — a "summary" with half its sections missing, a "transcript" with
 * nobody's name on it. Configuration standing in for a decision the product
 * should have made.
 *
 * <p>So it makes them. The summary is a PDF and it is complete. The transcript
 * is a PDF and it always says who spoke and when. The recording is an MP3.
 * There is no format picker, because a dropdown with one item in it is a
 * question with one answer, and no preview, because there is nothing left to
 * preview the effect of.
 *
 * <h2>What is deliberately unchanged</h2>
 *
 * <p>All of the reliability. Delivery is atomic: everything selected is fetched
 * first — documents from the API, the recording from object storage — and only
 * then is anything handed to the browser, so a failure downloads nothing rather
 * than half an export. One file goes to disk directly; two or three go as a
 * single ZIP, never as three download prompts. The duplicate-click guard is
 * still a ref rather than the `busy` state, because `disabled` only takes
 * effect after a paint. The MP3 link is still re-checked rather than trusted,
 * because it is signed and short-lived and the case it exists for — a retry
 * after something else failed — is exactly when it has expired.
 *
 * <p>A failure keeps the dialog open <em>and keeps the selections</em>, so
 * pressing Export again retries the same export. Closing and reopening starts
 * from the defaults.
 */

import * as React from "react";
import { toast } from "sonner";
import { Upload, Loader2, Music, FileText, Captions, AlertCircle } from "lucide-react";
import { useLazyGetMp3ExportQuery } from "@/lib/api";
import { fetchExportFile, fetchSignedFile, type ExportFile } from "@/lib/exports";
import { runExport, type ExportFailure, type ExportItem } from "@/lib/export-run";
import { linkIsFresh, prepareMp3, type Mp3Link } from "@/lib/mp3-export";
import type { SummaryResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  /**
   * Whether there is a summary to export at all.
   *
   * <p>Only its presence is read now. It used to drive a section list and a
   * preview; the document is server-built and complete, so the dialog does not
   * need to know what is in it.
   */
  summary?: SummaryResponse;
  /** How many utterances there are. Zero means there is nothing to export. */
  transcriptLines?: number;
  /** Set when the meeting is being read in a translation, so the file matches. */
  language?: string | null;
  /** False for meetings imported as documents, which never had a recording. */
  hasAudio?: boolean;
}

/** What each row is, in the order the reference draws them. */
type Part = "summary" | "transcript" | "audio";

const ROWS: { part: Part; title: string; description: string; icon: typeof FileText }[] = [
  {
    part: "summary",
    title: "Summary",
    description: "A complete summary of the meeting.",
    icon: FileText,
  },
  {
    part: "transcript",
    title: "Transcript",
    description: "Full conversation with speakers and timestamps.",
    icon: Captions,
  },
  {
    part: "audio",
    title: "Audio",
    description: "The meeting recording.",
    icon: Music,
  },
];

/** The extension each part comes out as, said once in the footer. */
const EXTENSION: Record<Part, string> = {
  summary: "Summary.pdf",
  transcript: "Transcript.pdf",
  audio: "Audio.mp3",
};

export function ExportDialog({
  open,
  onOpenChange,
  meetingId,
  summary,
  transcriptLines = 0,
  language,
  hasAudio = false,
}: ExportDialogProps) {
  /*
   * What actually exists. A switch for something that cannot be produced is a
   * control that fails when pressed, so an absent part is off and disabled
   * rather than on and hopeful.
   */
  const available: Record<Part, boolean> = {
    summary: Boolean(summary),
    transcript: transcriptLines > 0,
    audio: hasAudio,
  };

  const [selected, setSelected] = React.useState<Record<Part, boolean>>({
    summary: false,
    transcript: false,
    audio: false,
  });

  const [busy, setBusy] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [failures, setFailures] = React.useState<ExportFailure[]>([]);

  /*
   * Every opening starts from the defaults: the two documents on, the
   * recording off. Keyed on `open` going true rather than on mount, because
   * the dialog stays mounted between openings -- and deliberately not on the
   * availability flags, so a summary that arrives while the dialog is open
   * cannot re-tick a row somebody has just switched off.
   *
   * <p>A failure leaves `open` true, which is what preserves the selections
   * for a retry.
   */
  React.useEffect(() => {
    if (!open) return;
    setSelected({
      summary: Boolean(summary),
      transcript: transcriptLines > 0,
      // Off by default. It is the one that is tens of megabytes and the one
      // people want least often.
      audio: false,
    });
    setFailures([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * The duplicate-click guard, and it is a ref rather than the `busy` state on
   * purpose. `disabled={busy}` only takes effect after React has re-rendered,
   * so two clicks dispatched before that paint both pass — which on a slow
   * machine starts two conversions and two downloads. A ref is written
   * synchronously, in the handler, before the first `await`.
   */
  const running = React.useRef(false);
  // Read inside the export closure, which was created before the last link
  // arrived; state alone would give it a stale one.
  const heldMp3 = React.useRef<Mp3Link | null>(null);

  const [fetchMp3] = useLazyGetMp3ExportQuery();

  const chosen = ROWS.filter((r) => selected[r.part] && available[r.part]);
  const count = chosen.length;

  function clearAll() {
    setSelected({ summary: false, transcript: false, audio: false });
  }

  /**
   * A link to the recording as an MP3, waiting for the conversion if there is
   * one to wait for.
   *
   * <p>The held link is checked rather than trusted. It is signed and
   * short-lived, and the case it exists for — a second press after something
   * else failed — is exactly the case where enough time has passed for it to
   * have died. Asking again for a recording already converted costs a signature.
   */
  async function mp3(): Promise<Mp3Link> {
    const held = heldMp3.current;
    if (linkIsFresh(held, Date.now())) return held;
    setPreparing(true);
    try {
      const link = await prepareMp3(() => fetchMp3(meetingId).unwrap());
      heldMp3.current = link;
      return link;
    } finally {
      setPreparing(false);
    }
  }

  /**
   * The recording, as bytes this tab is holding.
   *
   * <p>Two steps, and the split matters. `mp3()` waits for the conversion and
   * comes back with a short-lived signed URL; `fetchSignedFile` then reads that
   * URL directly from object storage. The recording never passes through the
   * API — the transfer is browser to bucket — but it does now pass through this
   * tab, because an export that promises all-or-nothing has to know the audio
   * arrived before it offers anybody an archive, and a navigation to a signed
   * URL tells you nothing.
   */
  async function fetchAudioFile(): Promise<ExportFile> {
    const link = await mp3();
    return fetchSignedFile(link.url, link.filename);
  }

  async function onExport() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailures([]);

    const items: ExportItem[] = [];
    if (selected.summary && available.summary) {
      // No options. The endpoint decides what a summary is, which is all of it.
      items.push({
        part: "summary",
        fetch: () => fetchExportFile(meetingId, "summary", { language }),
      });
    }
    if (selected.transcript && available.transcript) {
      items.push({
        part: "transcript",
        fetch: () => fetchExportFile(meetingId, "transcript", { language }),
      });
    }
    // Last, because it is the one that may have to wait for a conversion, and
    // converting a recording for an export whose documents have already failed
    // is a minute of somebody's CPU spent on nothing.
    if (selected.audio && available.audio) {
      items.push({ part: "audio", fetch: fetchAudioFile });
    }

    try {
      const outcome = await runExport({ items });

      setFailures(outcome.failures);
      for (const failure of outcome.failures) {
        toast.error(failure.message);
      }
      // Nothing to say on partial success, because there is no longer any such
      // thing: `complete` is the only path on which a file was delivered.
      if (outcome.complete) {
        onOpenChange(false);
      }
    } catch (error) {
      /*
       * `runExport` handles every failure it expects, so reaching here means
       * something outside the parts went wrong. Caught anyway: an export that
       * throws silently, leaves the button re-enabled and says nothing is the
       * exact shape of the bug this whole change exists to remove.
       */
      void error;
      const message = "Couldn't finish this export. Nothing was downloaded — try again.";
      setFailures([{ part: null, message }]);
      toast.error(message);
    } finally {
      running.current = false;
      setBusy(false);
      setPreparing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      {/*
        One column, and no scroller of its own. The old dialog was `max-w-4xl`
        with a preview beside the controls and a second scrolling region inside
        the first, which is the double-scroll the V2 study exists to remove.
        Three rows and a footer fit at every desktop height; the primitive caps
        itself at the viewport on a phone.
      */}
      <DialogContent className="max-w-[min(46rem,calc(100vw-2rem))] gap-0 p-0">
        <DialogHeader className="px-6 pb-5 pt-6 text-left">
          <DialogTitle className="text-title-l font-headline">Export</DialogTitle>
          <DialogDescription className="text-body text-ink-3">
            Choose what to take.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6">
          {ROWS.map((row) => (
            <Row
              key={row.part}
              row={row}
              on={selected[row.part] && available[row.part]}
              available={available[row.part]}
              busy={busy}
              onChange={(next) => setSelected((prev) => ({ ...prev, [row.part]: next }))}
            />
          ))}
        </div>

        {/*
          Said where it happened, and it survives the dialog staying open: an
          export that failed has to leave the reason on screen, because a toast
          is gone by the time somebody looks up from the downloads folder.
        */}
        {failures.length > 0 && (
          <div className="px-6 pt-4" role="status">
            {failures.map((failure, i) => (
              <p
                key={i}
                className="flex items-start gap-2 text-callout leading-[1.5] text-danger"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {failure.message}
              </p>
            ))}
          </div>
        )}

        {/* A hairline, not a panel. The footer is part of the same surface. */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line px-6 py-4">
          <div className="min-w-0">
            <p className="text-body font-headline text-ink">
              {count === 0
                ? "Nothing selected"
                : `${count} ${count === 1 ? "file" : "files"} selected`}
            </p>
            {/*
              The formats, said once, in the one place they are a consequence
              rather than a choice. A `PDF` badge on every card would be three
              labels for a decision nobody makes.
            */}
            <p className="truncate text-callout text-ink-4">
              {count === 0
                ? "Turn on what you want to take."
                : chosen.map((r) => EXTENSION[r.part]).join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={clearAll} disabled={busy || count === 0}>
              Clear
            </Button>
            <Button onClick={() => void onExport()} disabled={busy || count === 0}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {/* Truthful about which wait this is: a conversion is the one
                      that takes a minute, and a button that says "Exporting…"
                      through it reads as stuck. */}
                  {preparing ? "Preparing audio…" : "Exporting…"}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One choosable thing: what it is, what it gives you, and a switch.
 *
 * <p>The icon sits on its own quiet surface, which is what the reference draws
 * and what stops three rows of text reading as a list of settings.
 */
function Row({
  row,
  on,
  available,
  busy,
  onChange,
}: {
  row: { part: Part; title: string; description: string; icon: typeof FileText };
  on: boolean;
  available: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  const Icon = row.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg px-4 py-4",
        "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))]",
        !available && "opacity-55",
      )}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-text"
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-title-3 font-headline text-ink">{row.title}</p>
        <p className="text-callout leading-[1.5] text-ink-3">
          {/* The reason, where the reason exists. A greyed switch with no
              explanation is the thing people report as broken. */}
          {available ? row.description : `${row.title} is not available for this meeting.`}
        </p>
      </div>

      <Switch
        checked={on}
        onCheckedChange={onChange}
        disabled={busy || !available}
        // Named for what it does, not for what it is: "Summary" alone reads as
        // a heading to a screen reader moving through the dialog.
        aria-label={`Include ${row.title}`}
      />
    </div>
  );
}
