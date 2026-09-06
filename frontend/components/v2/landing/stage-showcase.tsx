"use client";

/**
 * HOW IT WORKS, as one product visual that changes while the copy passes it.
 *
 * <h2>Why this is sticky rather than three sections</h2>
 *
 * <p>Three stacked blocks, each with its own screenshot, is the SaaS default
 * and it makes the reader compare three pictures of three different products.
 * The pipeline is not three products — it is one recording moving through three
 * stages — so there is one window, and it moves through them as you do.
 *
 * <p>That is the pacing the brief asks for: large moments, one at a time, and
 * the motion doing something a static image cannot. What the reader sees is a
 * recording becoming a transcript becoming a brief, which is exactly the claim
 * the copy beside it is making.
 *
 * <h2>Everything in it is real</h2>
 *
 * <p>Stage one is the live text the recorder actually streams while a meeting
 * runs (`useLiveTranscript`), with the timer and level meter the docked bar
 * actually draws. Stage two is a transcript grouped into turns with the speaker
 * naming and timecodes the product actually has. Stage three is a brief with
 * summary sections and action items carrying their source second.
 *
 * <p>Nothing is shown that production cannot do. The names and sentences are
 * invented, because a marketing page cannot use anybody's real meeting.
 */

import * as React from "react";
import { m, useInView, AnimatePresence } from "framer-motion";
import { Mic, Check } from "lucide-react";
import { BrandMark } from "@/components/v2/brand-mark";
import { LANDING_EASE, useMotionAllowed } from "@/components/v2/landing/reveal";
import { cn } from "@/lib/utils";

interface Stage {
  kicker: string;
  title: string;
  body: string;
}

const STAGES: Stage[] = [
  {
    kicker: "Capture",
    title: "Record it, or bring it",
    // The caveat is in the prose, not only in the window's caption. The live
    // words are a fast pass made without hearing the end of the sentence; the
    // canonical transcript is written from the whole file after Stop. Leaving
    // that inside a picture marked `aria-hidden` meant the one reader who most
    // needs it — anybody who cannot see the picture — never got it.
    body: "Record in the browser with nothing to install and nothing joining the call — and the recording keeps running while you look something else up. Or import audio or video you already have. Words appear live as they are said; the full transcript is written from the recording after you stop.",
  },
  {
    kicker: "Understand",
    title: "Speakers, separated",
    body: "Diarization tells the voices apart and numbers them by who spoke first. Naming them is a rename you make, and every word stays clickable to the second it was said.",
  },
  {
    kicker: "Read",
    title: "A brief, and what it asks of you",
    body: "A summary shaped by the kind of meeting it was, with the action items, decisions and risks read out of it — each carrying the sentence it came from.",
  },
];

/**
 * The capture demonstration, as a fixed number of ticks.
 *
 * <p>Four seconds and then nothing. Everything the frame shows — the clock, the
 * level, how many live lines have arrived — is derived from one counter, so
 * there is one timer to start, one to stop, and no way for the three to
 * disagree about whether the demonstration is over.
 */
export const CAPTURE = {
  /** 00:38 when it begins, 00:42 when it stops. */
  startSeconds: 38,
  /** The demonstration's whole resolution. Ten of these make a clock second. */
  tickMs: 100,
  /** Forty of them: four seconds. */
  ticks: 40,
  /** Ticks between one live line arriving and the next — about 1.1s. */
  ticksPerLine: 11,
} as const;

/**
 * <p>`waiting` — on the page but not yet reached; the first frame, no timer.
 * <p>`playing` — the four seconds.
 * <p>`settled` — the last frame, held still, no timer.
 */
export type CapturePhase = "waiting" | "playing" | "settled";

export interface CaptureClock {
  tick: number;
  phase: CapturePhase;
}

export function StageShowcase() {
  const moving = useMotionAllowed();
  const [stage, setStage] = React.useState(0);

  /*
   * WHETHER THE READER HAS ACTUALLY REACHED THE WINDOW.
   *
   * <p>Not `once`: leaving the section has to stop the clock as surely as
   * changing stage does. The one-shot rule is held by the phase below, which is
   * the right place for it — an observer that only ever fires once cannot tell
   * you that somebody has gone away again.
   *
   * <p>This gate is why the demonstration is worth having at all. Without it
   * the stage defaults to 0 and the clock starts at page load, so a reader who
   * spends fifteen seconds on the hero arrives at a recording that finished
   * before they got there.
   */
  const frame = React.useRef<HTMLDivElement>(null);
  const onScreen = useInView(frame, { margin: "0px 0px -15% 0px" });
  const capture = useCaptureDemo(onScreen && stage === 0, moving);

  /*
   * THE STAGE IS WHICHEVER BLOCK OF COPY IS CENTRED.
   *
   * <p>This was scroll progress across the whole track, cut into equal thirds —
   * and it was wrong on screen: the window showed the brief while the copy
   * beside it was still explaining speakers. It could not be right, because the
   * thirds are of the *track*, which also contains the heading and the top
   * margin, while each block centres its own text within its own viewport. The
   * two never lined up, and tuning the offsets would only have moved where they
   * disagreed.
   *
   * <p>So the copy decides. Each block reports when it crosses the middle of
   * the viewport and the window follows — which is self-aligning by
   * construction, and stays correct if a block's height or the section's
   * padding ever changes.
   */

  return (
    <section aria-labelledby="how" className="mx-auto max-w-doc px-6 lg:px-8">
      <p className="v2-label" id="how">
        How it works
      </p>

      {/*
       * ONE window, repositioned — not one per breakpoint.
       *
       * <p>Rendering a mobile copy above the copy and a sticky copy beside it
       * put two of them in the DOM at every width: the same words twice, and
       * two sets of live intervals driving two stopwatches and two level
       * meters, one of which nobody could see. `order` moves the single
       * instance instead, which is what CSS is for.
       */}
      <div className="mt-8 flex flex-col lg:grid lg:grid-cols-[1fr_minmax(0,560px)] lg:gap-16">
        <div className="order-2 mt-10 lg:order-1 lg:mt-0">
          {STAGES.map((s, i) => (
            <StageCopy
              key={s.title}
              stage={s}
              index={i}
              active={stage === i}
              moving={moving}
              onCentred={setStage}
            />
          ))}
        </div>

        {/* Sticky only where there is a column to be sticky in. `top-0` clears
            nothing — this page has no fixed chrome — so it centres itself in
            the viewport instead. */}
        <div ref={frame} className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center">
            <Window stage={stage} moving={moving} capture={capture} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One stage's words.
 *
 * <p>A full viewport tall on a desktop, which is what makes the window beside
 * it hold still long enough to be looked at. The inactive ones dim rather than
 * hide: a reader scrolling back up should be able to see where they came from,
 * and a block that disappears when it is not the current one makes the page
 * feel like it is deciding what you may read.
 */
function StageCopy({
  stage,
  index,
  active,
  moving,
  onCentred,
}: {
  stage: Stage;
  index: number;
  active: boolean;
  moving: boolean;
  /** Called when this block crosses the middle of the viewport. */
  onCentred: (index: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  /*
   * A narrow band across the viewport's middle. Not `once`: the reader scrolls
   * back up, and the window has to follow them.
   */
  const centred = useInView(ref, { margin: "-45% 0px -45% 0px" });

  React.useEffect(() => {
    if (centred) onCentred(index);
  }, [centred, index, onCentred]);

  return (
    <div
      ref={ref}
      className="flex min-h-[42vh] flex-col justify-center py-10 lg:min-h-screen lg:py-0"
    >
      <m.div
        animate={moving ? { opacity: active ? 1 : 0.32 } : undefined}
        transition={{ duration: 0.45, ease: LANDING_EASE }}
        className={cn("max-w-[46ch]", !moving && "opacity-100")}
      >
        <p className="v2-label flex items-center gap-2 text-brand-text">
          <span className="tabular font-mono">{String(index + 1).padStart(2, "0")}</span>
          {stage.kicker}
        </p>
        <h3 className="mt-3 text-title-l font-headline leading-[1.14] tracking-[-0.018em] text-ink">
          {stage.title}
        </h3>
        <p className="mt-4 text-[1.0625rem] leading-[1.6] text-ink-2">{stage.body}</p>
      </m.div>
    </div>
  );
}

/* ------------------------------- the window ------------------------------- */

/**
 * The product, in one frame, in whichever stage the reader has reached.
 *
 * <p>The band is the real one: 48px, glass, the Seam mark, the three places.
 * What changes underneath it is the page, which is what changes in the product.
 */
function Window({
  stage,
  moving,
  capture,
}: {
  stage: number;
  moving: boolean;
  capture: CaptureClock;
}) {
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="v2-band flex h-band items-center gap-1 px-3">
        <span className="flex h-8 w-8 items-center justify-center text-ink">
          <BrandMark size={18} />
        </span>
        <span className="ml-1 flex items-center">
          {["Now", "Library", "Ask"].map((place) => (
            <span
              key={place}
              className={cn(
                "relative flex h-band items-center px-[11px] text-body",
                place === "Now"
                  ? "font-headline text-ink after:absolute after:inset-x-[11px] after:bottom-0 after:h-[2px] after:rounded-t-[1px] after:bg-ink after:content-['']"
                  : "text-ink-3",
              )}
            >
              {place}
            </span>
          ))}
        </span>
        <span className="flex-1" />
        {/* Red only while stage one is running, because that is the only stage
            in which anything is being captured. The chip stays red once the
            demonstration settles — the product state being illustrated really
            is "recording" — but the lamp stops pulsing, because a marketing
            page should not run an animation forever to say so. */}
        <span
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-foot font-headline",
            stage === 0 ? "bg-danger/15 text-danger" : "bg-brand-fill text-white",
          )}
        >
          {stage === 0 ? (
            <>
              <span
                data-lamp={capture.phase === "playing" ? "pulsing" : "still"}
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-danger",
                  moving && capture.phase === "playing" && "animate-recpulse",
                )}
              />
              Recording
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Record
            </>
          )}
        </span>
      </div>

      {/* One height for all three, so the window does not resize under the
          reader as the stage changes — a frame that grows and shrinks while you
          scroll is the thing that makes a sticky visual feel unstable. */}
      <div className="relative h-[360px] overflow-hidden p-5 sm:h-[400px] sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={stage}
            initial={moving ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={moving ? { opacity: 0, y: -10 } : undefined}
            transition={{ duration: 0.4, ease: LANDING_EASE }}
            className="absolute inset-0 p-5 sm:p-6"
          >
            {stage === 0 ? (
              <Capturing clock={capture} />
            ) : stage === 1 ? (
              <Transcript />
            ) : (
              <Brief />
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const LINES = [
  { who: "Priya", at: "0:04", text: "Let us start with pricing, because that is the one that has been open longest." },
  { who: "Dev", at: "0:19", text: "I would hold the price and move the annual discount instead." },
  { who: "Priya", at: "0:31", text: "Fifteen per cent on annual. Can you note the invoice copy?" },
];

/**
 * The live pass: a clock, a level, and words arriving as they are said.
 *
 * <p>It owns no timer of its own. Everything it draws is a function of the tick
 * it is handed, which is what makes the demonstration stoppable from outside —
 * and what stops a frame nobody is looking at from animating.
 */
function Capturing({ clock }: { clock: CaptureClock }) {
  const { tick, phase } = clock;
  const settled = phase === "settled";

  /* Ten ticks to the second, so 00:38 becomes 00:42 and stays there. */
  const seconds = CAPTURE.startSeconds + Math.floor(tick / (1000 / CAPTURE.tickMs));
  const shown = Math.min(LINES.length, 1 + Math.floor(tick / CAPTURE.ticksPerLine));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <span data-clock className="tabular font-mono text-title-2 leading-none text-ink">
          {`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
        </span>
        <Level frame={tick} />
      </div>

      <div className="mt-5 space-y-4">
        {LINES.slice(0, shown).map((line, i) => (
          <m.div
            key={line.at}
            initial={phase === "playing" ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: LANDING_EASE }}
            /* The newest line is dim while it is still provisional. Once the
               demonstration settles they are all full strength — a line left
               permanently at 70% reads as a rendering fault, not as a caveat. */
            className={cn(i === shown - 1 && !settled && "opacity-70")}
          >
            <span className="text-cap text-ink-4">
              {line.who} <span className="text-ink-5">·</span>{" "}
              <span className="tabular font-mono">{line.at}</span>
            </span>
            <p className="v2-read mt-0.5">{line.text}</p>
          </m.div>
        ))}
      </div>

      <p className="mt-auto text-foot text-ink-4">
        Live text while it runs. The full transcript is written from the
        recording after you stop.
      </p>
    </div>
  );
}

/** Turns, with the names and timecodes the product actually renders. */
function Transcript() {
  const TURNS = [
    { who: "Priya", at: "12:34", text: "Fifteen per cent on annual, then. Can you note the invoice copy?" },
    { who: "Dev", at: "12:41", text: "I will take that. It needs a line about proration as well." },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-6 border-b border-line pb-2.5">
        <span className="-mb-px border-b-2 border-ink pb-2.5 text-callout font-headline text-ink">
          Transcript
        </span>
        <span className="text-callout text-ink-3">Summary</span>
      </div>

      <div className="mt-5 space-y-5">
        {TURNS.map((t) => (
          <div key={t.at} className="flex gap-3">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-fill/25 text-[10px] font-medium text-brand-text">
              {t.who[0]}
            </span>
            <div className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="text-callout font-headline text-ink">{t.who}</span>
                <span className="tabular font-mono text-cap text-ink-4">{t.at}</span>
              </span>
              <p className="v2-read mt-0.5">{t.text}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-auto text-foot text-ink-4">
        Click any word to play from it. Correct a line, rename a speaker, or
        highlight a passage.
      </p>
    </div>
  );
}

/** The brief, and the action items read out of it. */
function Brief() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-6 border-b border-line pb-2.5">
        <span className="text-callout text-ink-3">Transcript</span>
        <span className="-mb-px border-b-2 border-ink pb-2.5 text-callout font-headline text-ink">
          Summary
        </span>
      </div>

      <p className="v2-read mt-5">
        The team held list pricing and moved the annual discount to 15%. Invoice
        copy needs a proration line before it ships.
      </p>

      <p className="v2-label mt-6">Action items</p>
      <div className="mt-2 space-y-2.5">
        {[
          { title: "Note the invoice copy", who: "Dev", at: "12:41" },
          { title: "Confirm proration wording", who: "Unassigned", at: "13:02" },
        ].map((a) => (
          <div key={a.title} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-edge">
              <Check className="h-3 w-3 text-transparent" />
            </span>
            <span className="min-w-0">
              <span className="block text-body text-ink">{a.title}</span>
              <span className="block text-cap text-ink-4">
                {a.who} <span className="text-ink-5">·</span>{" "}
                <span className="tabular font-mono">{a.at}</span>
              </span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-auto text-foot text-ink-4">
        Each one plays the sentence it was read out of.
      </p>
    </div>
  );
}

/* -------------------------------- the parts ------------------------------- */

/**
 * THE CAPTURE DEMONSTRATION'S CLOCK, AND THE ONLY TIMER ON THIS SECTION.
 *
 * <h2>What it replaced, and why that was wrong</h2>
 *
 * <p>Two `setInterval`s: one incrementing a stopwatch every second and wrapping
 * at five minutes, another redrawing the level meter every 110ms. Neither had
 * an end. Leave the page parked on Capture and the clock climbed past 01:17
 * while the meter churned on beside it — indefinitely, for as long as anybody
 * stayed on the section.
 *
 * <p>That is the wrong thing for this frame to be. It is a demonstration that
 * Reverie <em>can</em> record, not a pretence that a meeting is being recorded
 * right now, and a marketing page that simulates a live application for a
 * minute has stopped illustrating the product and started impersonating it. It
 * also spent a timer and a React render every 110ms to say nothing new.
 *
 * <h2>What it is now</h2>
 *
 * <p>One counter, forty ticks, four seconds. The effect schedules the next tick
 * only while there is one left to schedule — so on the last frame it returns
 * early and <b>nothing is queued at all</b>. The timer is not left running
 * against a frozen display; there is no timer.
 *
 * <p>Three things end it, and all three end it the same way:
 *
 * <ul>
 *   <li>reaching the last tick;</li>
 *   <li>the reader moving to another stage, or scrolling the window off
 *       screen, before it gets there — `active` goes false, the pending
 *       timeout is cleared, and it settles where a resumed clock would only
 *       look like a recording somebody had paused;</li>
 *   <li>unmounting, which clears the pending timeout and queues nothing.</li>
 * </ul>
 *
 * <p>And it runs <b>once per page lifecycle</b>. `settled` is terminal: coming
 * back to Capture shows the finished frame rather than replaying four seconds
 * of fake recording at every reader who scrolls up.
 *
 * <h2>Reduced motion</h2>
 *
 * <p>Straight to the finished frame, with no timer ever started. Set in an
 * effect rather than in the initial state deliberately: the server cannot know
 * the preference — `useReducedMotion` is `null` there — so initialising the two
 * passes differently would be a hydration mismatch. Both render tick 0 and the
 * client settles immediately after mounting, which is not an animation, it is
 * the absence of one.
 */
export function useCaptureDemo(active: boolean, moving: boolean): CaptureClock {
  const [tick, setTick] = React.useState(0);
  const [phase, setPhase] = React.useState<CapturePhase>("waiting");

  const settle = React.useCallback(() => {
    setTick(CAPTURE.ticks);
    setPhase("settled");
  }, []);

  React.useEffect(() => {
    if (!moving && phase !== "settled") settle();
  }, [moving, phase, settle]);

  /* Begins when the reader reaches it, and only from `waiting` — which is what
     makes it a one-shot rather than something that restarts on every return. */
  React.useEffect(() => {
    if (phase === "waiting" && active && moving) setPhase("playing");
  }, [phase, active, moving]);

  React.useEffect(() => {
    if (phase !== "playing") return;

    if (tick >= CAPTURE.ticks || !active) {
      settle();
      return;
    }

    const id = setTimeout(() => setTick((t) => t + 1), CAPTURE.tickMs);
    return () => clearTimeout(id);
  }, [phase, tick, active, settle]);

  return { tick, phase };
}

/**
 * The level meter, as the docked bar draws it.
 *
 * <p>Ink for sound and a hairline for silence — the recording bar's own
 * decision, for the reason recorded there: full-strength red across a whole
 * card turns a level meter into an alarm, and the thing that is genuinely
 * urgent is the lamp, not the level.
 */
function Level({ frame }: { frame: number }) {
  const BARS = 28;

  /*
   * The tail eases the amplitude down over the last quarter of the
   * demonstration, so the meter *settles* rather than stopping dead on
   * whatever the last frame happened to be. It settles low but not flat: a flat
   * hairline is what this draws for silence, and a silent meter under a red
   * Recording chip is a contradiction.
   */
  const progress = Math.min(1, frame / CAPTURE.ticks);
  const envelope = progress < 0.75 ? 1 : 1 - ((progress - 0.75) / 0.25) * 0.6;

  return (
    <span aria-hidden data-level className="flex h-4 items-center gap-[3px]">
      {Array.from({ length: BARS }).map((_, i) => {
        /* Deterministic rather than random: a fresh Math.random() per render
           would differ between the server pass and the first client pass, which
           is a hydration mismatch reported as a React error. It is also what
           lets the settled frame be a fixed picture rather than wherever an
           interval happened to leave it. */
        const wave =
          Math.abs(Math.sin((i + frame) * 0.7)) * Math.abs(Math.cos(i * 0.31 + frame * 0.2));
        const height = Math.max(2, Math.round(wave * 15 * envelope));
        return (
          <span
            key={i}
            className={cn(
              "w-[2px] rounded-full transition-[height] duration-100",
              height > 3 ? "bg-ink-2" : "bg-line-strong",
            )}
            style={{ height }}
          />
        );
      })}
    </span>
  );
}
