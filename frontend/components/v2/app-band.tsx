"use client";

/**
 * THE BAND — forty-eight pixels, and the whole of the permanent chrome.
 *
 * <h2>What it replaced</h2>
 *
 * <p>A 256px navigation rail down the left and a 64px header across the top:
 * 320px of chrome on a 1440px screen, 22% of it, present on every page whether
 * or not anything in it was wanted. The rail held two links, a folder tree, a
 * bell, an allowance meter and an account button — six things, of which the two
 * links were the navigation. The header held global actions and the page's own
 * actions in one row, which is why it needed a rulebook (lib/chrome.ts) to stop
 * them colliding.
 *
 * <p>This is one row, 48px, and it is the same row on every page. Left: the
 * mark and three words. Centre: Search. Right: Record, Import, notifications,
 * you.
 * Nothing here belongs to the page underneath — page actions live in the page,
 * beside the thing they act on — which is what makes a fixed shape possible and
 * what makes the rulebook unnecessary.
 *
 * <h2>Glass, once</h2>
 *
 * <p>The band is the functional layer above content, which is the only thing
 * translucency is for in this product. It is never nested inside another glass
 * surface and content never uses it. See `.v2-band` in app/globals.css.
 *
 * <h2>While recording, the band is the state</h2>
 *
 * <p>It turns rather than gaining a pill beside everything else. There was a
 * live-recording pill in the old header and it was removed for a reason that
 * still holds: the docked bar along the bottom carries the waveform, the clock
 * and the two buttons that end the recording, so a second statement of the same
 * fact was a smaller copy of a thing already on screen. What the band adds is
 * ambient rather than duplicated — you cannot look at any page without seeing
 * that the chrome has changed colour.
 */

import * as React from "react";
import Link from "next/link";
import { Mic, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOME } from "@/lib/routes";
import { openSearch } from "@/lib/search-overlay";
import { BrandMark } from "@/components/v2/brand-mark";
import { Places } from "@/components/v2/places";
import { useStartRecording } from "@/components/v2/record-action";
import { NotificationBell } from "@/components/notification-bell";
import { AccountMenu } from "@/components/account-menu";

export interface AppBandProps {
  pathname: string;
  /** Whether Import and Record are offered. See `bandChrome` in lib/chrome.ts. */
  create: boolean;
  /** Whether the recorder is holding anything. Turns the band. */
  recording: boolean;
  onImport: () => void;
}

export function AppBand({ pathname, create, recording, onImport }: AppBandProps) {
  const record = useStartRecording(pathname);

  return (
    <header
      /*
       * Fixed rather than sticky. Sticky needs one scrolling ancestor and this
       * app has several — a transcript scrolls itself, the side pane scrolls
       * itself, and a page that is shorter than the window scrolls nothing at
       * all. Fixed is the same result under every one of those.
       */
      className="v2-band no-print fixed inset-x-0 top-0 z-40 h-band"
      data-recording={recording ? "true" : undefined}
    >
      {/*
       * THREE COLUMNS, and that is the whole of how Search is centred.
       *
       * <p>It was a flex row with a spacer, which puts Search wherever the left
       * group happens to end — so it drifted with the length of the place names
       * and sat visibly right of centre. `1fr auto 1fr` gives the middle column
       * its content width and splits the remainder evenly on both sides, which
       * centres it against the *window* regardless of what the two groups
       * weigh. Below `md` the middle column is empty and the sides carry
       * everything, which is why the same grid works on a phone.
       */}
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-2 pl-3 pr-2 sm:pl-4 sm:pr-3">
        <div className="flex min-w-0 items-center gap-1">
        {/* The mark goes home, which is the one thing a logo in a corner has
            meant for as long as there have been corners. Not a place in the
            row of three: it is the same destination as Now, and a nav with
            two ways to the same page teaches people that one of them is
            something else. */}
        <Link
          href={HOME}
          aria-label="Reverie — home"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink opacity-90 transition-opacity duration-press ease-soft hover:opacity-100"
        >
          <BrandMark size={18} />
        </Link>

        {/* Below `md` these are the bottom tabs instead. Three words plus five
            controls do not fit across a phone, and navigation is the half that
            is easier to reach with a thumb at the bottom. See
            components/v2/mobile-tabs.tsx. */}
        <Places pathname={pathname} className="ml-1 hidden md:flex" />
        </div>

        {/* The centre column. Empty on a phone, where a search field wide
            enough to look like one would leave no room for the controls that
            have to be reachable. */}
        <div className="hidden justify-center sm:flex">
          <FindButton />
        </div>

        {/*
          `col-start-3`, and it is load-bearing below `sm`.
          <p>The centre column's content is `hidden` on a phone, which takes it
          out of grid placement altogether -- so these controls were
          auto-placed into the *middle* track and the third track sat empty
          against the right edge. Measured at 390: the group ended at x=265 of
          390, with 125px of nothing to the right of the avatar.
          <p>Naming the column fixes them to it whatever drops out.
        */}
        <div className="col-start-3 flex items-center justify-end gap-1">
          {/*
            ONE RUN OF GLYPHS, then a rule, then the account.

            <p>Record, Import and the bell are three 36px glyphs at one gap.
            They were two outlined boxes and then, past a rule, a bare bell
            beside the avatar: four controls in three treatments.

            <p>Record has been three things. A filled iris pill, which made the
            loudest thing in the whole application a button that starts a
            recording nobody asked for. Then an outlined pill reading `Record`.
            Now a bare mic -- and the word came off with the stroke, because
            they were propping each other up: an outlined square beside an
            outlined pill is a pair of boxes, and once the boxes are gone a
            word beside a glyph is a pair of unlike things.

            <p>What is left is the band own idiom, which the bell and the
            search field were already using: an operable thing is a glyph that
            takes a fill on hover. `title` and `aria-label` carry the names, so
            nothing is lost but the outline.

            <p>The bell moved to this side of the rule. It was grouped with the
            avatar, on the reading that the rule separates what is about the
            work from what is about you, and a notification is addressed to
            you. It reads better here, and the reason is the avatar rather than
            the bell: the avatar is the only filled circle in the band and the
            only thing in it that opens a menu about the account, so left alone
            after the rule it terminates the row -- which is where an account
            control is looked for. The bell becomes a third glyph in a run of
            one size rather than the first half of a pair that never quite read
            as a pair.
          */}
          <div className="mr-1 flex items-center gap-2">
            {create && (
              <>
                <BandIcon
                  label="Record a conversation"
                  onClick={record.start}
                  // Not disabled: a dead button explains nothing, and the
                  // reason is the whole of what somebody needs here. It stays
                  // pressable and answers, and the refusal replaces the name
                  // in the tooltip when there is one.
                  title={record.refusal ?? undefined}
                  // Hidden below `md`, where it is the fourth bottom tab.
                  className="hidden md:flex"
                >
                  <Mic className="h-[18px] w-[18px]" />
                </BandIcon>

                {/* A plus, which is what the reference draws, and it opens the
                    Import dialog that already exists. Not a create menu: there
                    is exactly one thing this makes, and a menu with one item in
                    it is a click somebody pays for nothing.

                    A dialog rather than a route: a file arrives more often than
                    anything else creates a meeting, and it should not cost
                    leaving whatever is on screen. /upload still exists for the
                    fuller form -- filing straight into a folder -- and for
                    direct links. */}
                <BandIcon label="Import a recording" onClick={onImport}>
                  <Plus className="h-[18px] w-[18px]" />
                </BandIcon>
              </>
            )}

            {/* Always drawn. Unlike Record and Import it is not about making
                anything, so no page has a reason to withhold it. */}
            <NotificationBell />
          </div>

          {/*
            THE RULE, and it is drawn everywhere now.

            <p>It was conditional on `create`, because without Record and
            Import the two things left -- the bell and the avatar -- were the
            same kind of thing, and a stroke with nothing to separate is a
            stroke floating in a row. The bell is on the other side of it now,
            so there is always something on both sides and the band keeps one
            shape on every page.

            <p>`bg-edge`, not `bg-line`. `--line` is a 6% white hairline meant
            for the boundary between rows of a list, where a whole page of them
            reads as a grid; one 16px stroke of it in a dark band is 1.14:1 and
            simply is not there. `--edge` is the token for a stroke that is
            supposed to be seen.
          */}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-edge" />

          {/* THE ONE THING THAT IS ABOUT YOU, and it ends the row. The avatar
              is the band only filled circle, so it keeps the room around it. */}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * Search, which is not an input.
 *
 * <p>Clicking it opens the real one, which needs the whole width of the screen
 * for its results — an inline box that grew a dropdown on focus would have to
 * fight the band for room and would lose on a laptop. ⌘K works everywhere
 * regardless; the shortcut is bound on the shell.
 *
 * <p>It is on every page now. The old rule stripped it on Account Settings, on
 * the grounds that search finds meetings and there are none on those pages —
 * true, and it made the header change shape on the one navigation people make
 * most deliberately. In a band that is otherwise identical everywhere, the
 * missing control reads as a fault. See lib/chrome.ts.
 */
function FindButton() {
  return (
    <button
      type="button"
      onClick={() => openSearch()}
      aria-label="Search"
      className={cn(
        /*
          30px tall, and an explicit length.

          <p>It was `w-full max-w-[232px]`, which did nothing at all: the band
          is `grid-cols-[1fr_auto_1fr]` and this sits in the `auto` track, so
          the track is content-width, `w-full` resolves to the content, and the
          `max-w` was never reached. Measured at 1440: 86px, a pill sized to
          the word `Search`, which is what made it read as another action in
          the right-hand group rather than as a field. A field has a width, and
          this is the first version that actually has one.

          <p>Two of them, because the middle track takes its width out of the
          two groups either side: 340 is right on a laptop and would squeeze
          the account controls at 640, where the band first draws this at all.

          <p>The height is untouched. A taller box in a 48px band leaves it
          almost no air, and length is the dimension that makes a field look
          like somewhere a sentence can go.
        */
        "flex h-[30px] w-[260px] items-center gap-2 rounded-md bg-white/[0.05] px-2.5 lg:w-[340px]",
        "text-callout text-ink-4 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)]",
        "transition-colors duration-press ease-soft hover:bg-white/[0.08] hover:text-ink-3",
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">Search</span>
      {/*
        NO SHORTCUT BADGE. There was a `⌘K` keycap at the far end, on the
        reasoning that a shortcut is better shown than taught.

        <p>What it actually did was put a second bordered thing inside a field
        whose whole job is to look like one open space, at the end where the
        eye lands after reading the placeholder — and it was wrong on Windows
        and Linux, where the binding is Ctrl. The shortcut still works
        everywhere; it is bound on the shell, not on this button.

        <p>Its `pr-1.5` went with it: the field is evenly padded now, which is
        what it should have been the moment there was nothing to inset.
      */}
    </button>
  );
}

/**
 * A glyph in the band, at 36px.
 *
 * <p>Every operable thing on the right-hand side is one of these — Record,
 * Import, and the bell, which `NotificationBell` draws to the same
 * measurements. It has been outlined and is not any more; see the note at the
 * call site for why the strokes and Record's word came off together. What says
 * it is a control is the fill it takes on hover, which is what the search field
 * does too.
 *
 * <p>Square rather than a labelled pill: a word in here would make the run the
 * loudest thing in a band that is on every page, and the names sit on
 * `aria-label` and `title`, where they cost no width.
 */
function BandIcon({
  label,
  onClick,
  title,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  /**
   * The tooltip, where it should say something other than the name.
   *
   * <p>Record uses it for a refusal — "you have four minutes left this month"
   * is the whole of what somebody needs, and it belongs on the control rather
   * than in a toast after the press. `aria-label` stays the name either way,
   * so the button is always findable by what it does.
   */
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3",
        "transition-colors duration-press ease-soft hover:bg-surface-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
