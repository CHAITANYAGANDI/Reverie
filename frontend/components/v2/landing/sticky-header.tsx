"use client";

/**
 * The public bar, which now stays.
 *
 * <h2>What changed, and what deliberately did not</h2>
 *
 * <p>Only the scroll behaviour and the background. The lockup, the two links,
 * the 68px height, the `max-w-doc` measure, the type and the INK button are the
 * bar that was here before, moved into a client component without a pixel of
 * difference — `app/page.test.tsx` pins the header's two links and their order,
 * and it passes unchanged.
 *
 * <p>The padding is the one exception, and only below `sm`. See "Narrow
 * phones".
 *
 * <p>It had to become a client component because the page is a server one and
 * this now reads the scroll position. Extracted into its own file rather than
 * marking the page `"use client"`: the page's own note is that it is a server
 * component and that only the motion pieces are clients, and turning the whole
 * front door into a client bundle to know whether somebody has scrolled 12
 * pixels would be a poor trade.
 *
 * <h2>Two states, and nothing between them</h2>
 *
 * <p><b>At the top: nothing.</b> No background, no border, no shadow, no
 * backdrop filter. The hero's light runs up behind the bar exactly as it did,
 * which is the point — a permanent dark rectangle over the identity is what
 * this avoids.
 *
 * <p><b>Scrolled: glass.</b> `--glass` is the product's own functional-layer
 * token (near-black at 72%), `--line` its hairline (white at 6%), and the
 * blur is 18px with the token's own 1.6 saturation. The saturation is not
 * decoration: it is what stops a translucent dark panel going muddy over dark
 * content, which is why the token carries it.
 *
 * <p>The blur is 18 rather than the token's 28. `--glass-filter` is written for
 * a menu or a sheet — a small surface over a busy one — and at 28px across the
 * full width of the page the hero artwork's top edge was visibly smeared as it
 * passed under the bar. 18 reads as glass and leaves the mark alone.
 *
 * <h2>Narrow phones</h2>
 *
 * <p>The row is the lockup and two actions, and on a 320px screen those do not
 * fit inside a 24px gutter with 32px between them. Flex resolved that the only
 * way it can: both links shrank to their longest word, and `Sign in` came apart
 * onto two lines inside a 36px-tall pill.
 *
 * <p>So the actions are `shrink-0` and `whitespace-nowrap` — they are two words
 * and a destination, and there is no version of either that reads correctly
 * broken in half — and the space around them comes down instead: a 16px gutter,
 * 12px between the lockup and the nav, 8px between the two actions, and a
 * little less inside each pill. Every one of those is a `sm:` away from the
 * value it had, so from 640px up this is the bar that was designed, untouched.
 *
 * <p>The trade is deliberate. With nothing left to shrink, a viewport too
 * narrow even for the reduced values overflows the row rather than folding a
 * button — which is visible, and therefore fixable, in a way that a silently
 * wrapped label is not.
 *
 * <h2>The threshold</h2>
 *
 * <p>12px. Below that a reader has not scrolled, they have twitched a
 * trackpad, and a bar that changes state on two pixels of movement flickers.
 * Above it they are reading the page and the bar is over content, which is
 * when it needs a surface.
 *
 * <p>Only a boolean is stored. The listener runs on every scroll event — it is
 * one comparison — and `setScrolled` is given the identity check, so React
 * bails out of the update on every event except the two that cross the
 * threshold. Nothing about the scroll position enters state.
 */

import * as React from "react";
import Link from "next/link";
import { Lockup } from "@/components/v2/lockup";

/** Where transparent becomes glass. See the note above. */
const THRESHOLD = 12;

export function StickyHeader() {
  const scrolled = useScrolled(THRESHOLD);

  return (
    /*
     * `sticky`, not `fixed`: the bar keeps its place in the flow, so it takes
     * no height out of the document and nothing below it moves. A fixed bar
     * would need the hero to be padded by exactly its height for ever.
     *
     * <p>`z-40` rather than the old `z-10`. The product window inside
     * `StageShowcase` is itself `lg:sticky lg:top-0`, so the two share the top
     * of the viewport and the bar has to be the one in front — otherwise the
     * page scrolls a screenshot of the application over its own navigation.
     *
     * <p>THE HAIRLINE IS A SHADOW, NOT A BORDER, and the browser is why.
     * `border-b border-transparent` animating to `border-line` keeps the box
     * stable between the two states — but it makes the bar 68px plus a border
     * in both of them, and the measurement said 69. A pixel taller than the
     * bar that was here is still a changed header height, so the line moved
     * into `box-shadow` with `inset`: it paints on the bottom edge, it costs
     * no layout, and the bar measures 68 again.
     */
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={[
        "sticky top-0 z-40",
        // Three properties, named. `transition-all` here would animate the
        // sticky offset as well, which is the one thing that must not move.
        "transition-[background-color,box-shadow,backdrop-filter]",
        "duration-panel ease-soft",
        "data-[scrolled]:bg-[rgb(var(--glass))]",
        "data-[scrolled]:backdrop-blur-[18px] data-[scrolled]:backdrop-saturate-[1.6]",
        // The hairline, then the shadow. Soft and short, and deliberately not
        // a floating shadow: the bar is part of the page's top edge rather
        // than an object hovering over it.
        "data-[scrolled]:shadow-[inset_0_-1px_0_rgb(var(--line)),0_8px_24px_-16px_rgb(0_0_0_/_0.6)]",
      ].join(" ")}
    >
      {/* The gutter and the gap, smaller on a phone and only there. See
          "Narrow phones" above for what this is buying and what it costs. */}
      <div className="mx-auto flex h-[68px] max-w-doc items-center gap-3 px-4 sm:gap-8 sm:px-6 lg:px-8">
        {/* 21px of wordmark with a 30px orb beside it — see `MARK` in
            components/v2/lockup, which is where that ratio lives so the bar,
            the auth shell and the SSO screen cannot drift apart. 30 is also
            what the bare orb here measured before the word came back, so the
            mark itself did not change size. */}
        <Lockup size={21} />
        {/* `shrink-0`, so the pair is never the thing that gives. */}
        <nav aria-label="Reverie" className="ml-auto flex shrink-0 items-center gap-2 sm:gap-6">
          {/* A 36px target, not a 20px line of text. It sits beside a filled
              button of the same height, and a link half its neighbour's height
              is both harder to hit and reads as less of an option than it is. */}
          <Link
            href="/sign-in"
            className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-1.5 text-body text-ink-3 transition-colors hover:text-ink sm:px-2"
          >
            Sign in
          </Link>
          {/* INK, not the accent.
              The V2 palette's own rule: "the primary button in this product is
              INK — a Save button is not an observation, and an accent spent on
              every button is an accent that means nothing." */}
          <Link
            href="/sign-up"
            className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-ink px-3 text-body font-headline text-surface transition-opacity duration-press ease-soft hover:opacity-90 sm:px-4"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * Whether the page has been scrolled past `threshold`.
 *
 * <p>A boolean and nothing else. The scroll position is read inside the
 * listener and thrown away; what is held is one flag, and the identity check
 * means React re-renders on the two events that cross the line rather than on
 * all of them.
 *
 * <p>`passive: true` so the listener can never delay a scroll — it does not
 * call `preventDefault` and telling the browser so is what keeps scrolling off
 * the main thread's critical path.
 *
 * <p>Read once on mount as well as on scroll, because a reload restores the
 * previous scroll position: without it, returning to the middle of the page
 * gives a transparent bar over content until the first wheel event.
 *
 * <p>False on the server and on the first client render, so the served HTML
 * and the hydration pass agree and nothing flashes.
 */
function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const read = () => {
      const next = window.scrollY > threshold;
      setScrolled((current) => (current === next ? current : next));
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, [threshold]);

  return scrolled;
}
