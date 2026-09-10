import Link from "next/link";
import { Lockup } from "@/components/v2/lockup";
import { HeroBrandLockup, HeroHorizon } from "@/components/v2/landing/hero-brand";
import { HeroBeat } from "@/components/v2/landing/hero-beat";
import { HERO_BEATS } from "@/components/v2/landing/hero-beats";
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
 * <p>The mark and the word. It was a `<Mic />` glyph in a filled rounded square
 * — the generic recorder logo the V2 identity study rejected — then the lens
 * lockup, then the orb on its own with the word taken off, and the word is back
 * beside it on request.
 *
 * <p>Which reads better than the argument for removing it, in the end. That
 * argument was that the hero names the product a few hundred pixels below, so
 * the bar was saying it twice; but a bar with a single small mark in the corner
 * and nothing else is a bar that has lost something, and the hero is far enough
 * down the page that the two never read as a repetition.
 */
function Header() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex h-[68px] max-w-doc items-center gap-8 px-6 lg:px-8">
        {/* 21px of wordmark with a 30px orb beside it — see `MARK` in
            components/v2/lockup, which is where that ratio lives so the bar,
            the auth shell and the SSO screen cannot drift apart. 30 is also
            what the bare orb here measured before the word came back, so the
            mark itself did not change size. */}
        <Lockup size={21} />
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
 * TWO MOMENTS: who this is, and what it promises.
 *
 * <h2>What changed, and why</h2>
 *
 * <p>This was one moment — a 128px lockup, then immediately a 40px headline —
 * and the two were the same visual weight, so the page had no first thing. The
 * identity read as a logo pasted above a heading.
 *
 * <p>Now the identity is the first beat at the scale the artwork is drawn at,
 * there is real air under it, and the claim is the second beat at 56px. The
 * brand is larger; the headline is still the largest *sentence* on the page.
 * They are not competing, which is the whole point of the change.
 *
 * <h2>Height</h2>
 *
 * <p>`min-h-[calc(100svh-var(--band-nav))]` and centred in it, rather than a
 * stack of margins that happens to fill a 900px window. `svh` and not `vh`
 * because on a phone `vh` is the *largest* viewport — the one you get with the
 * browser chrome retracted — so a `100vh` hero is taller than the screen it is
 * on until you scroll.
 *
 * <p>It is allowed to push the first product section below the fold, and that
 * is the correction: cramming the identity, the claim, the body and two buttons
 * into 782px is what made the identity small in the first place.
 *
 * <p>`justify-center` with generous padding rather than a fixed hero height:
 * at a short laptop height the padding is what gives, the identity keeps its
 * scale, and the page scrolls. The alternative — scaling the brand down to fit
 * — is the thing being fixed.
 */
function Hero() {
  return (
    <section
      className="relative isolate flex min-h-[calc(100svh-68px)] flex-col items-center justify-center overflow-hidden px-6 pb-[clamp(3rem,7vh,6rem)] pt-[clamp(4.5rem,11vh,8.5rem)] text-center lg:px-8"
    >
      {/* The hero's own light, under everything in it. `AmbientCanvas` is
          still the page's wash and is untouched — see the note on it in
          `LandingPage`. This is the second, smaller relationship to the
          artwork: one line of light where the identity gives way to the page. */}
      <HeroHorizon />

      <HeroBrandLockup />

      {/*
        THE CLAIM, as its own moment.

        <p>`clamp(4rem, 7vh, 5.5rem)` between the identity and this — the brief
        asked for 56 to 72 and this is 64 to 88 at the heights the page is read
        at, measured rather than taken from the number, because the tagline's
        letterspaced caps sit optically higher than their box.

        <p>Two lines, and the break is written rather than left to the viewport:
        "Remember the conversation." and "Keep the meaning." are a pair, and a
        reflow that puts "Keep" at the end of the first line breaks the rhythm
        the copy is built on. They animate separately, a tenth of a second
        apart, which is the same pair read aloud.
      */}
      {/* The floor is 1.625rem, not 1.875. At 390 the wordmark's own clamp
          bottoms out at 30px, and a 30px headline under a 30px wordmark is a
          tie -- which is exactly the "nothing is first" problem this change
          exists to fix, reappearing at the one width where there is least room
          to establish a hierarchy. 26px still carries the claim. */}
      <h1 className="mt-[clamp(2.75rem,6vh,4.5rem)] max-w-[20ch] text-[clamp(1.625rem,4.6vw,var(--t-display))] font-headline leading-[1.06] tracking-[-0.022em] text-ink">
        <HeroBeat as="span" className="block" delay={HERO_BEATS.headlineFirst}>
          Remember the conversation.
        </HeroBeat>
        <HeroBeat as="span" className="block" delay={HERO_BEATS.headlineSecond}>
          Keep the meaning.
        </HeroBeat>
      </h1>

      <HeroBeat
        as="p"
        delay={HERO_BEATS.body}
        className="mx-auto mt-[clamp(1.125rem,1.6vh,1.5rem)] max-w-[62ch] text-[1.0625rem] leading-[1.6] text-ink-2"
      >
        Reverie turns recordings into a clear record: speakers, transcript,
        brief, action items, search, and answers grounded in the exact words
        that were said.
      </HeroBeat>

      {/*
        NO BUTTONS IN THE HERO — settled, after being unsettled twice.

        <p>`Create a free account` and `Sign in` stood here, were withdrawn,
        came back when a later composition drew them, and are withdrawn again.
        The reasoning that holds is the original one: the header above carries
        the same pair — `Get started` and `Sign in`, at the top of every screen
        — so the hero was offering the same two doors a second time within one
        viewport.

        <p>Which also lets the hero be what it is: an identity, a claim, and
        what it costs. The reader is not asked to decide before the page has
        shown them anything; the product does that further down, and the closing
        section has its own way in. The hero ends on the cost line and the page
        moves on.

        <p>`Sign in` is still reachable three ways — the header, the footer, and
        the header of every authenticated route. Nothing was closed.
      */}

      {/*
        WHAT IT COSTS.

        <p>The slot held "100 minutes and three imports, for the life of the
        account. No card." in `--ink-4`, under the buttons it qualified. That
        line was withdrawn as a grey footnote nobody read. This is the approved
        replacement and it is a better sentence: it leads with the numbers and
        says *free* and *no card* outright rather than leaving both to be
        inferred.

        <p>`--ink-3` rather than `--ink-4`: at ink-4 it was furniture, and with
        the buttons gone this is the hero's closing line rather than a footnote
        under something else.

        <p>The numbers are `UsageLimitService.MINUTES_ALLOWANCE` and
        `IMPORT_ALLOWANCE`. `Keeping` states the same two further down together
        with what happens when they run out; this is the glance, that is the
        detail.
      */}
      <HeroBeat
        as="p"
        delay={HERO_BEATS.note}
        className="mt-[clamp(1.5rem,2.4vh,2rem)] text-foot text-ink-3"
      >
        100 transcription minutes and 3 imports included free. No card required.
      </HeroBeat>
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
        {/* THE WORD ALONE. Asked for as just `Reverie` at the bottom of the
            page, so the mark is withdrawn here and only here — the bar above
            carries it, and so does every other lockup in the product. `muted`
            still takes the line to `--ink-3`. */}
        <Lockup size={14} muted mark={false} />
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
