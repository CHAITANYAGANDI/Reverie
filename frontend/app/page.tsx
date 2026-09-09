import Link from "next/link";
import { Lockup, LockupStacked } from "@/components/v2/lockup";
import { Reveal, Stagger } from "@/components/v2/landing/reveal";
import { StageShowcase } from "@/components/v2/landing/stage-showcase";
import { AskShowcase } from "@/components/v2/landing/ask-showcase";
import { LanguageMoment } from "@/components/v2/landing/language-moment";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { LandingMotion } from "@/components/v2/landing/motion-provider";

/**
 * The front door.
 *
 * <h2>The composition, and where it comes from</h2>
 *
 * <p>`design-demo/final/55-landing.html`: the public canvas with its one
 * ambient wash, a 68px nav that does not out-weigh the hero, a centred claim,
 * and then the product itself at full width. What is added on top of that is
 * <b>pacing</b> — five large moments instead of one, each held until the reader
 * arrives at it, and each demonstrating something rather than asserting it.
 *
 * <p>Deliberately <b>not</b> added: cards, gradients, a logo wall,
 * testimonials, an integrations grid, a pricing table, a statistics strip. Half
 * of what makes a competitor's marketing page feel full is social proof and
 * integrations, and Reverie has one plan, no integrations and no named
 * customers — so those sections could only be filled by inventing them. This
 * page is longer because there is more true material, not because there are
 * more containers.
 *
 * <h2>The sequence</h2>
 *
 * <ol>
 *   <li><b>Hero.</b> One claim, two ways in. Not animated: it is above the
 *       fold, and revealing it means the first thing anybody sees is an empty
 *       page.</li>
 *   <li><b>The product.</b> A still preview, immediately, so the page shows
 *       what it is before it explains itself.</li>
 *   <li><b>How it works.</b> One window moving through capture → understand →
 *       read, sticky, while the copy scrolls past it. Three stages of one
 *       recording, not three screenshots of three products.</li>
 *   <li><b>Ask Reverie.</b> The largest moment, and the only one that runs a
 *       sequence: a question typed, an answer arriving, and the citation
 *       resolving into the words it came from.</li>
 *   <li><b>Languages.</b> One line of a brief, in six of the eighteen.</li>
 *   <li><b>Included.</b> Two groups, hairlines, no cards.</li>
 *   <li><b>Yours.</b> The quiet close: no training, retention you set, export,
 *       deletion. Not a second call to action — the hero already asked, and a
 *       page that asks again at the bottom did not trust its own middle.</li>
 * </ol>
 *
 * <h2>Every claim maps to production</h2>
 *
 * <p>No Memory, no Commitment Ledger, no Decision Drift, no Decision History,
 * no semantic search, no YouTube or PDF import, no integrations, no
 * system-audio or tab capture. `app/page.test.tsx` asserts the absence of each,
 * and the reasoning is in `docs/v2-implementation/final-parity-audit.md` §6.
 *
 * <p>This file is a server component. The clients are the four motion pieces
 * and `LandingMotion`, which is a context provider with no markup of its own —
 * so the copy is in the served HTML, with a `<noscript>` override below for the
 * one thing that would otherwise depend on JavaScript. `LandingMotion` wraps
 * the whole body rather than only the sections that animate today, so a reveal
 * added to the header or footer later cannot silently fail to run.
 */

export const metadata = {
  title: "Reverie — remember the conversation",
  description:
    "Reverie turns recordings into a clear record: speakers, transcript, brief, action items, search, and answers grounded in the exact words that were said.",
};

export default function LandingPage() {
  return (
    /*
     * NO `overflow-hidden` here, and that is load-bearing rather than tidy.
     *
     * <p>An ancestor with `overflow: hidden` becomes the scroll container that
     * `position: sticky` measures against — so the sticky product window in the
     * showcase below stopped sticking entirely and sat at the top of its grid
     * cell, scrolling out of view while the copy beside it ran on for three
     * viewports. The section looked like it had lost its illustration.
     *
     * <p>It was here to clip the ambient wash. The wash is `inset-x-0` and
     * cannot overflow sideways on its own, so there was nothing to clip.
     */
    <div className="relative min-h-screen bg-background">
      {/*
       * Scroll reveals render at `opacity: 0` in the server HTML, so without
       * this a reader with JavaScript disabled gets a hero and nothing under
       * it. One rule, and the whole page is legible again.
       */}
      {/* `dangerouslySetInnerHTML` because React does not reliably place element
          children inside a `<noscript>` — the tag's content is parsed as raw
          text, so a nested <style> can end up as nothing at all. This is the
          one place on the page where that API is the correct tool. */}
      <noscript
        dangerouslySetInnerHTML={{
          /* `[data-word]` and `[data-utterance]` are the capture
             demonstration's transcript, which is rendered in full from the
             first frame and revealed by opacity. Without JavaScript nothing
             ever reveals it, so the illustration would show a recording with no
             words in it. Same rule, same reason. */
          __html:
            "<style>[data-reveal],[data-word],[data-utterance]{opacity:1!important;transform:none!important}</style>",
        }}
      />

      {/*
       * THE ONE ORNAMENT, and it is shared now.
       *
       * V1 had two and used them on most screens. This one started here, on
       * the public and auth pages, for a single reason: a marketing page with
       * no photograph needs somewhere for the eye to land before the type
       * starts.
       *
       * <p>It is on Home as well now -- a deliberate product decision, not a
       * drift -- so the declaration moved into `.v2-ambient` and behind a
       * component. Identical output; one place to change it. See
       * components/v2/ambient-canvas.tsx.
       */}
      <AmbientCanvas />

      <LandingMotion>
        <div className="relative">
          <Header />

          {/*
           * The rhythm. Roughly a screen of air between moments on a desktop, so
           * each one arrives alone — which is most of what makes a long page read
           * as considered rather than as a list of sections.
           */}
          <main className="space-y-32 pb-32 sm:space-y-40 lg:space-y-48">
            {/* The hero on its own. It was paired with the preview inside a
                tighter `space-y-14`, because a still picture of the product
                belonged immediately under the claim rather than a screen
                further down; with the preview gone there is nothing to pair it
                with, and it takes the page's own rhythm like every other
                moment. */}
            <Hero />

            <StageShowcase />
            <AskShowcase />
            <LanguageMoment />
            <Included />
            <Keeping />
          </main>

          <Footer />
        </div>
      </LandingMotion>
    </div>
  );
}

/**
 * The public nav: the lockup, and the two ways in.
 *
 * <p>Sixty-eight pixels and no border. It must not be heavier than the hero —
 * this page has one job, and a bar competing with the claim under it is the
 * commonest way a landing page loses that job.
 *
 * <p>The mark is the product's own. It was a `<Mic />` glyph in a filled
 * rounded square, which is the generic recorder logo the V2 identity study
 * explicitly rejected — and it meant the public page and the application were
 * wearing two different brands.
 */
function Header() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex h-[68px] max-w-doc items-center gap-8 px-6 lg:px-8">
        <Lockup size={19} />
        <nav aria-label="Reverie" className="ml-auto flex items-center gap-6">
          {/* A 36px target, not a 20px line of text. It sits beside a filled
              button of the same height, and a link half its neighbour's height
              is both harder to hit and reads as less of an option than it is. */}
          <Link
            href="/sign-in"
            className="flex h-9 items-center rounded-full px-2 text-body text-ink-3 transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          {/* INK, not the accent.
              The V2 palette's own rule: "the primary button in this product is
              INK — a Save button is not an observation, and an accent spent on
              every button is an accent that means nothing." */}
          <Link
            href="/sign-up"
            className="flex h-9 items-center rounded-full bg-ink px-4 text-body font-headline text-surface transition-opacity duration-press ease-soft hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * One claim, centred, and the two ways in under it.
 *
 * <p>The measures are the artifact's: roughly 20 characters on the headline so
 * it breaks where it is written to break, and 62 on the body. The display step
 * is `--t-display`, which the type scale annotates as "the landing hero, once
 * per product" — this is the once.
 */
function Hero() {
  return (
    <section className="px-6 pt-[68px] text-center lg:px-8">
      {/*
        THE IDENTITY, ONCE, ABOVE THE CLAIM.

        <p>What was here was a kicker — "Meeting intelligence, without the
        meeting-tool clutter." — in azure `.v2-label`. It is gone, and the logo
        is in its place: the mark at a size where the waveform inside it is
        actually legible, with the word under it.

        <p>Yes, the nav above already carries a lockup. That one is 19px and
        functional: it is the thing you press to get home, in a row with Sign
        in and Get started. This is the identity, and a front door is allowed
        to say whose it is before it says what is behind it.
      */}
      <LockupStacked />

      {/* Two lines, and the break is written rather than left to the viewport:
          "Remember the conversation." and "Keep the meaning." are a pair, and a
          reflow that puts "Keep" at the end of the first line breaks the
          rhythm the copy is built on. */}
      <h1 className="mx-auto mt-9 max-w-[20ch] text-[clamp(1.875rem,7vw,var(--t-display))] font-headline leading-[1.06] tracking-[-0.022em] text-ink">
        <span className="block">Remember the conversation.</span>
        <span className="block">Keep the meaning.</span>
      </h1>

      <p className="mx-auto mt-5 max-w-[62ch] text-[1.0625rem] leading-[1.6] text-ink-2">
        Reverie turns recordings into a clear record: speakers, transcript,
        brief, action items, search, and answers grounded in the exact words
        that were said.
      </p>

      {/* Stacks below `sm`, where two side-by-side buttons are each too narrow
          to read and neither is a comfortable target. */}
      <div className="mt-[30px] flex flex-col items-center justify-center gap-2.5 sm:flex-row">
        <Link
          href="/sign-up"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-body font-headline text-surface transition-opacity duration-press ease-soft hover:opacity-90 sm:w-auto"
        >
          Create a free account
          <span aria-hidden>&rarr;</span>
        </Link>
        <Link
          href="/sign-in"
          className="flex h-11 w-full items-center justify-center rounded-full border border-edge px-6 text-body text-ink-2 transition-colors duration-press ease-soft hover:border-edge-hover hover:text-ink sm:w-auto"
        >
          Sign in
        </Link>
      </div>

      {/*
        NO PRICE LINE UNDER THE BUTTONS.

        <p>It read "100 minutes and three imports, for the life of the account.
        No card." — the answer to "what does it cost", set in `--ink-4` under
        the button it qualified.

        <p>Withdrawn, and the allowance is not: `Keeping` states it in full
        further down the page, next to what happens to the recording, which is
        where somebody weighing the product up is actually reading. A grey
        footnote under a call to action is read by nobody who has not already
        decided, and it was the last thing between the buttons and the fold.
      */}
    </section>
  );
}

/*
 * NO PRODUCT PREVIEW.
 *
 * <p>`function Preview` stood here: a still picture of the application under
 * the hero, behind a mask that faded its foot -- the band, the three places, a
 * conversation list, folders and an answer.
 *
 * <p>Every pixel of it was invented. "Good morning, Priya", "Product Weekly
 * 42:07", "Pricing sync 18:22", "Q4 planning 6" and an answer about an annual
 * discount are a fabricated account, and the one rule this page has held to
 * throughout is that nothing on it may be filled in by making it up. It is a
 * mock meeting with a fake name and a fake duration, which is the first item on
 * the do-not-ship list.
 *
 * <p>What is left demonstrates instead of asserting, and does it with the real
 * thing: `StageShowcase`, `AskShowcase` and `LanguageMoment` are the three
 * moving moments that come after this, and they were always the stronger
 * argument. The hero now runs straight into them.
 */

/**
 * What is in it, in two groups.
 *
 * <p>Two conceptual halves rather than a wall of feature cards: what Reverie
 * does to a recording, and what you then do with it. Each line is a line — a
 * hairline between them and nothing else. A bordered card per capability is how
 * ten true sentences come to read as a comparison table for a comparison
 * nobody is making, and there is one plan.
 *
 * <p>Every line is a capability production has today. The search line in
 * particular is deliberate: `SearchCommand` is lexical, with `when:` `type:`
 * `tag:` and `in:` operators over conversations and transcript mentions, and it
 * does not call `POST /search/semantic`. So it does not say "find a decision
 * without knowing the words".
 */
function Included() {
  return (
    <section className="mx-auto max-w-doc px-6 lg:px-8" aria-labelledby="included">
      <Reveal>
        <p className="v2-label" id="included">
          Included
        </p>
      </Reveal>

      <div className="mt-8 grid gap-x-12 gap-y-12 lg:grid-cols-2">
        {/* Each group is a section of its own, not a styled div. Two reasons:
            a screen reader gets a landmark per group rather than one list of
            ten unrelated capabilities, and the boundary is then a real thing a
            test can anchor on — "a row must not leak from one group into the
            other" needs a container to be true of. */}
        {GROUPS.map((group) => (
          <section key={group.heading} aria-labelledby={group.id}>
            <Reveal>
              <h2 id={group.id} className="text-title-1 font-headline text-ink">
                {group.heading}
              </h2>
            </Reveal>
            <Stagger as="ul" className="mt-4">
              {group.items.map((item) => (
                <li key={item.label} className="border-b border-line py-3.5">
                  <p className="text-body text-ink">{item.label}</p>
                  <p className="mt-1 text-callout leading-[1.5] text-ink-3">{item.detail}</p>
                </li>
              ))}
            </Stagger>
          </section>
        ))}
      </div>
    </section>
  );
}

const GROUPS = [
  {
    id: "capture",
    heading: "Capture & understand",
    items: [
      {
        label: "Record in your browser",
        detail:
          "Nothing to install, and nothing joins the call to do it. The recording keeps running while you look something else up.",
      },
      {
        label: "Import audio or video",
        detail: "A file you already have, uploaded straight to private storage.",
      },
      {
        label: "Speakers, separated",
        detail:
          "Diarization tells the voices apart and numbers them by who spoke first. Naming them is a rename you make.",
      },
      {
        label: "A brief you can shape",
        detail:
          "Summary templates for the kind of meeting it was, and a rewrite when the transcript changes.",
      },
      {
        label: "Action items, decisions and risks",
        detail:
          "Each with the sentence it was read out of, playable at the moment it was said.",
      },
    ],
  },
  {
    id: "work",
    heading: "Work with it",
    items: [
      {
        label: "Ask one meeting, or all of them",
        detail:
          "Answers cite the passages they came from, and a folder can be the scope.",
      },
      {
        label: "A transcript you can correct",
        detail:
          "Edit the words and the speaker labels. Highlight, bookmark and annotate up to 2,000 moments in a meeting.",
      },
      {
        label: "Search that jumps",
        detail:
          "Search conversations and transcript mentions, then jump to the exact moment.",
      },
      {
        label: "Read it in another language",
        detail: "The brief, the action items and the transcript, kept once translated.",
      },
      {
        label: "Yours to take, and to delete",
        detail:
          "Export the summary and the transcript as PDF, and the recording as MP3. Delete a recording, a transcript or the whole account.",
      },
    ],
  },
];

/**
 * The quiet close.
 *
 * <p>Not a second call to action. The hero already asked, and a page that asks
 * again at the bottom is a page that did not trust its own middle. What goes
 * here instead is what somebody who has read this far is actually weighing up:
 * what happens to the recording.
 *
 * <p>Every line is checkable. No training is `GeneralTab`'s own statement;
 * retention is `RETENTION_CHOICES`; deletion is `eraseAudio`, `eraseTranscript`
 * and close-account; the formats are `ExportFormat` plus MP3 audio; the
 * allowance is `UsageLimitService`.
 */
function Keeping() {
  return (
    <section className="mx-auto max-w-doc px-6 lg:px-8" aria-labelledby="keeping">
      <div className="max-w-[46ch]">
        <Reveal>
          <p className="v2-label" id="keeping">
            Yours
          </p>
          <h2 className="mt-3 text-title-l font-headline leading-[1.14] tracking-[-0.018em] text-ink">
            It stays yours, and you can take it or end it.
          </h2>
        </Reveal>
      </div>

      <Stagger className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {KEEPING.map((item) => (
          <div key={item.label}>
            <p className="text-body font-headline text-ink">{item.label}</p>
            <p className="mt-1.5 text-callout leading-[1.5] text-ink-3">{item.detail}</p>
          </div>
        ))}
      </Stagger>
    </section>
  );
}

const KEEPING = [
  {
    label: "No training on your meetings",
    detail:
      "Your recordings, transcripts and notes are not used to improve any model, are not reviewed by people here, and are not pooled with anybody else's.",
  },
  {
    label: "Retention you set",
    detail:
      "Choose how long recordings and transcripts are kept. Anything past the window is removed.",
  },
  {
    label: "Delete what you like",
    detail:
      "A recording, a transcript, one meeting, or the whole account — permanently, on the spot.",
  },
  {
    label: "One account, one workspace",
    detail:
      "Nothing is shared into it and nobody else can read it. There is no team tier to be upgraded into.",
  },
  {
    // Was "Export in four formats", listing Word, Markdown and plain text.
    // Three of the four had no consumer and the product no longer writes them;
    // a landing page advertising a format the app cannot produce is the worst
    // kind of copy, because somebody chooses Reverie for it.
    label: "Export what you came for",
    detail: "The summary and the transcript as PDF, and the recording as MP3.",
  },
  {
    label: "One plan, no card",
    detail:
      "100 transcribed minutes and three imports for the life of the account. Nothing expires, and nothing already transcribed is taken away.",
  },
];

/** A hairline, the lockup, and only links that go somewhere. */
function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-doc flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row lg:px-8">
        <Lockup size={14} muted />
        {/* `-mx-2` so the padding that makes these tappable does not push them
            off the footer's own alignment. */}
        <div className="-mx-2 flex items-center text-callout text-ink-3">
          <Link
            href="/privacy"
            className="flex h-9 items-center px-2 transition-colors hover:text-ink"
          >
            Privacy
          </Link>
          <Link
            href="/sign-in"
            className="flex h-9 items-center px-2 transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
