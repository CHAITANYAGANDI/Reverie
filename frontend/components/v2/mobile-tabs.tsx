"use client";

/**
 * The bottom tabs — navigation on a phone, and the fourth is Record.
 *
 * <h2>What this replaced</h2>
 *
 * <p>A hamburger that slid the whole 256px desktop rail in over a scrim. Three
 * problems with that, and the third is the one that mattered: it put navigation
 * behind a gesture, it reached the top-left corner of the screen — the furthest
 * point from a thumb — and it showed a folder tree, an allowance meter and an
 * account button to somebody who wanted to get to the chat.
 *
 * <p>Tabs are the platform convention on a phone because they are the only
 * arrangement where the destinations are visible without being opened and are
 * where the hand already is. The same three words as the band, in the same
 * order, so the app has one navigation with two shapes rather than two
 * navigations.
 *
 * <h2>Why Record is here and Search is not</h2>
 *
 * <p>Record is a fourth tab rather than a fifth control in the band because a
 * phone is the device most likely to be the recorder — it is the thing on the
 * table — and because a filled pill in a 48px band beside four icons is what a
 * thumb hits by accident. Search stays in the band: it opens a full-screen
 * sheet either way, so its position costs nothing, and a magnifier among three
 * destinations is the classic way to make a tab bar mean two things.
 *
 * <h2>The navigation owns the bottom edge, and the dock sits above it</h2>
 *
 * <p>It was the other way round: this lifted by `--recording-bar` while one was
 * running, which put the recording dock below the navigation and hard against
 * the bottom of the window. Two things were wrong with that. The dock is
 * transient and the tabs are permanent, so the arrangement moved the fixed
 * thing and parked the temporary one in the place a thumb rests; and on a phone
 * the very bottom strip is where the system gesture bar lives, which is the
 * last place to put Stop.
 *
 * <p>So this stays on the bottom edge always, and the bar lifts itself clear of
 * it — see `bottom-tabbar` in components/recording-bar.tsx. `--recording-bar`
 * is still published, because the page's own bottom padding is measured from
 * it; it is only no longer this element's offset.
 */

import * as React from "react";
import Link from "next/link";
import { Library as LibraryIcon, Mic, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASK, HOME, LIBRARY } from "@/lib/routes";
import { placeFor, type PlaceId } from "@/lib/places";
import { useStartRecording } from "@/components/v2/record-action";
import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";

const TABS: { id: PlaceId; href: string; label: string; icon: typeof Home | null }[] = [
  { id: "home", href: HOME, label: "Home", icon: Home },
  { id: "library", href: LIBRARY, label: "Library", icon: LibraryIcon },
  /*
   * NO GLYPH, BECAUSE THIS ONE IS AN IDENTITY.
   *
   * <p>It was a `Sparkles`, and the destination it leads to is called Reverie
   * AI — so what belongs here is the orb, which is the approved mark for
   * Reverie's assistant. `null` rather than a component, because the orb takes
   * a size where lucide glyphs take a stroke width and a class.
   */
  { id: "ask", href: ASK, label: "Reverie AI", icon: null },
];

export function MobileTabs({
  pathname,
  create,
  live,
}: {
  pathname: string;
  /** Whether Record is offered. Withheld while one is in hand. */
  create: boolean;
  /**
   * Whether audio is being captured RIGHT NOW -- running or paused.
   *
   * <p>Not "the recorder is holding something", which is what this used to be
   * given and is why the tab still read `Recording`, in red, after Stop. The
   * recorder is not idle then: it is holding audio waiting to be saved or
   * discarded. That is what the dock above is for, and what this tab says
   * instead is `Record`, disabled -- because a second recording cannot be
   * started until the first one is dealt with.
   */
  live: boolean;
}) {
  const record = useStartRecording(pathname);
  const here = placeFor(pathname);

  return (
    <nav
      aria-label="Places"
      className="v2-band no-print fixed inset-x-0 bottom-0 z-40 flex h-tabbar items-stretch md:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        // Inside a meeting, Library is still lit. Icons in a tab bar are always
        // lit for *something* — a bar where nothing is selected reads as one
        // that has lost track of where you are.
        const on = here.id === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={on && !here.nested ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-press ease-soft",
              on ? "text-ink" : "text-ink-4",
            )}
          >
            {/*
              24px OF ORB, AND THE LABEL CARRIES THE STATE.

              <p>26, up a step from 24 with the rest of them. 24 was the floor:
              rasterised at true device pixels the approved artwork keeps its
              sphere, its rim light and a bright waveform core down to 20, and
              24 is where the waveform is still legible as bars. 26 puts its box
              at 31, which with a 13px label and a 2px gap is 46 of the bar's
              56 — so there is room and no more. It is larger than the 18px
              glyphs beside it, which is the cost of a filled colour mark in a
              row of monochrome line icons.

              <p>The orb never dims, because tinting this artwork is the one
              thing the identity rules forbid. So the tab's state is carried by
              everything else: the label goes `--ink-4` to `--ink`, takes the
              headline weight, and `aria-current` says so. The only thing that
              changes behind the orb is its halo, which is a span under the
              image rather than anything done to it.
            */}
            {Icon ? (
              <Icon className="h-[18px] w-[18px]" strokeWidth={on ? 2.1 : 1.7} />
            ) : (
              <ReverieAiMark size={26} active={on} />
            )}
            <span className={cn(on && !here.nested && "font-headline")}>{tab.label}</span>
          </Link>
        );
      })}

      {/* The fourth. Not a destination, and drawn as one anyway: a tab bar with
          three even columns and a floating button over the top of it is two
          controls fighting for the same corner, and the button always wins the
          fight and loses the label. */}
      <button
        type="button"
        onClick={record.start}
        disabled={!create}
        title={record.refusal ?? undefined}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-press ease-soft",
          // Withheld, not hidden, while one is running: the column disappearing
          // would move the other three under a thumb that is already moving.
          // What it says instead is that a recording is already happening.
          live ? "text-danger" : create ? "text-ink-4" : "text-ink-5",
        )}
      >
        <Mic className="h-[18px] w-[18px]" strokeWidth={1.7} />
        <span>{live ? "Recording" : "Record"}</span>
      </button>
    </nav>
  );
}
