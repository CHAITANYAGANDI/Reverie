import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import {
  StageShowcase,
  useCaptureDemo,
  CAPTURE,
} from "@/components/v2/landing/stage-showcase";
import { LandingMotion } from "@/components/v2/landing/motion-provider";

/**
 * THE CAPTURE DEMONSTRATION MUST END.
 *
 * <h2>The bug these exist for</h2>
 *
 * <p>The Capture frame ran two `setInterval`s with no end: a stopwatch every
 * second and a level meter every 110ms. Parked on that stage, the clock climbed
 * past 01:17 and the meter churned beside it for as long as anybody stayed —
 * so a page meant to show that Reverie <em>can</em> record instead impersonated
 * a meeting that was being recorded, and burned a timer and a React render ten
 * times a second to do it.
 *
 * <p>Two more faults sat on top of that one. The meter carried an inline
 * `height` recomputed ten times a second from a chaotic pair of trig functions,
 * which is what read as flicker — and because a bar has no text in it, its
 * varying height dragged the baseline of the flex row it sat in, changing that
 * row's height between 17px and 21px and shoving the whole transcript up and
 * down. Measured before the fix: the first line's top took thirty distinct
 * values and travelled 50px in one sequence.
 *
 * <p>It is now sixty ticks and then nothing; the bars are a fixed size and only
 * scale; and every word of the transcript exists from the first frame. These
 * tests pin all of it — above all that <b>no timer survives the end</b>, which
 * is the half that would rot silently, because a frozen display looks identical
 * whether the interval behind it was stopped or merely ignored.
 *
 * <h2>Why the clock is tested directly</h2>
 *
 * <p>`useCaptureDemo` takes `active` and `moving` as plain booleans, so the
 * timer contract can be asserted without a viewport and without a media query.
 * That matters for the reduced-motion case in particular: Framer Motion reads
 * `prefers-reduced-motion` once per process and caches it, so a component test
 * gets one answer per file and cannot ask for the other. The hook is also where
 * `vi.getTimerCount()` means something — it is the only thing scheduling
 * anything, so a count of zero is a real claim rather than a hope that nothing
 * else in the tree happened to own a timeout.
 *
 * <p>The component tests then prove the wiring: that the clock reaches the
 * frame, that the reader sees 00:38 become 00:44, that no word is ever inserted
 * into the transcript, and that the picture is genuinely still afterwards.
 */

/*
 * This file tests the *animated* path, so it reports no motion preference —
 * `vitest.setup.ts` answers "reduce" by default and says as much. Reduced
 * motion is covered below through the hook, which does not consult the query.
 */
globalThis.matchMedia = ((query: string) => ({
  media: query,
  matches: false,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;

/* ------------------------------ the viewport ------------------------------ */

/**
 * A viewport the test drives, rather than one that reports everything visible.
 *
 * <p>The shared setup's observer fires `isIntersecting: true` for every element
 * the moment it is observed, which is right for tests about copy being present
 * and useless here: all three copy blocks would report themselves centred and
 * the last one would win, so the window would show the brief and the Capture
 * frame would never render at all.
 *
 * <p>Observers are told apart by their `rootMargin`, which is how Framer Motion
 * passes `useInView`'s `margin` through.
 */
const COPY_MARGIN = "-45% 0px -45% 0px";
const WINDOW_MARGIN = "0px 0px -15% 0px";

interface Watch {
  el: Element;
  cb: IntersectionObserverCallback;
  io: IntersectionObserver;
  margin: string;
}

let watches: Watch[] = [];

class StubObserver {
  readonly root = null;
  readonly thresholds: ReadonlyArray<number> = [];
  readonly rootMargin: string;

  constructor(
    private readonly cb: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.rootMargin = options?.rootMargin ?? "";
  }

  observe(el: Element) {
    watches.push({
      el,
      cb: this.cb,
      io: this as unknown as IntersectionObserver,
      margin: this.rootMargin,
    });
  }

  unobserve(el: Element) {
    watches = watches.filter((w) => !(w.io === (this as unknown) && w.el === el));
  }

  disconnect() {
    watches = watches.filter((w) => w.io !== (this as unknown));
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function announce(match: (w: Watch) => boolean, isIntersecting: boolean) {
  act(() => {
    for (const w of [...watches].filter(match)) {
      w.cb(
        [{ target: w.el, isIntersecting } as unknown as IntersectionObserverEntry],
        w.io,
      );
    }
  });
}

/** The product window scrolls onto, or off, the screen. */
const windowOnScreen = (on: boolean) => announce((w) => w.margin === WINDOW_MARGIN, on);

/** Block `index` of the copy crosses the middle of the viewport. */
function centreCopy(index: number) {
  const copy = watches.filter((w) => w.margin === COPY_MARGIN);
  act(() => {
    copy.forEach((w, n) => {
      w.cb(
        [
          {
            target: w.el,
            isIntersecting: n === index,
          } as unknown as IntersectionObserverEntry,
        ],
        w.io,
      );
    });
  });
}

/**
 * Advance the demonstration one tick at a time.
 *
 * <p>Each tick is scheduled by an effect that runs after the previous one's
 * state update, so a single large `advanceTimersByTime` would fire the timeout
 * that exists and never see the ones React had not queued yet. Stepping gives
 * every tick its own flush, which is both accurate and deterministic.
 */
function play(ms: number) {
  const steps = Math.ceil(ms / CAPTURE.tickMs);
  for (let i = 0; i < steps; i++) {
    act(() => {
      vi.advanceTimersByTime(CAPTURE.tickMs);
    });
  }
}

beforeEach(() => {
  watches = [];
  globalThis.IntersectionObserver = StubObserver as unknown as typeof IntersectionObserver;
});

/* -------------------------------- the clock ------------------------------- */

describe("the capture clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the first frame and schedules nothing until the reader arrives", () => {
    const { result } = renderHook(() => useCaptureDemo(false, true));

    expect(result.current).toEqual({ tick: 0, phase: "waiting" });
    // The stage defaults to Capture, so without this gate the demonstration
    // would run at page load and be over before anybody scrolled to it.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advances once the reader reaches it", () => {
    const { result } = renderHook(() => useCaptureDemo(true, true));
    expect(result.current.phase).toBe("playing");

    play(1000);

    expect(result.current.tick).toBe(1000 / CAPTURE.tickMs);
    expect(result.current.phase).toBe("playing");
  });

  it("reaches its last frame and settles", () => {
    const { result } = renderHook(() => useCaptureDemo(true, true));

    play(CAPTURE.ticks * CAPTURE.tickMs);

    expect(result.current.tick).toBe(CAPTURE.ticks);
    expect(result.current.phase).toBe("settled");
  });

  it("stops the timer rather than leaving one running against a frozen frame", () => {
    const { result } = renderHook(() => useCaptureDemo(true, true));

    play(CAPTURE.ticks * CAPTURE.tickMs);
    expect(result.current.phase).toBe("settled");

    // The whole bug, in one assertion. A display that has stopped changing is
    // not the same thing as a timer that has stopped running.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not move again however long the reader stays", () => {
    const { result } = renderHook(() => useCaptureDemo(true, true));

    play(CAPTURE.ticks * CAPTURE.tickMs);
    const settled = result.current.tick;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.tick).toBe(settled);
    expect(result.current.phase).toBe("settled");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at once when the reader moves to another stage mid-demonstration", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useCaptureDemo(active, true),
      { initialProps: { active: true } },
    );

    play(1000);
    expect(result.current.phase).toBe("playing");

    rerender({ active: false });

    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.phase).toBe("settled");
    // Settled at the end rather than abandoned part-way: a clock stopped at
    // 00:39 reads as a recording somebody paused.
    expect(result.current.tick).toBe(CAPTURE.ticks);
  });

  it("does not replay when the reader scrolls back to Capture", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useCaptureDemo(active, true),
      { initialProps: { active: true } },
    );

    play(CAPTURE.ticks * CAPTURE.tickMs);
    expect(result.current.phase).toBe("settled");

    rerender({ active: false });
    rerender({ active: true });

    expect(result.current.phase).toBe("settled");
    expect(result.current.tick).toBe(CAPTURE.ticks);
    expect(vi.getTimerCount()).toBe(0);

    play(2000);
    expect(result.current.tick).toBe(CAPTURE.ticks);
  });

  it("leaves nothing scheduled when it unmounts part-way through", () => {
    const { unmount } = renderHook(() => useCaptureDemo(true, true));

    play(1000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders the finished frame immediately under reduced motion", () => {
    const { result } = renderHook(() => useCaptureDemo(true, false));

    // Not a faster demonstration — no demonstration. The finished state, and
    // no timer was ever started to reach it.
    expect(result.current.phase).toBe("settled");
    expect(result.current.tick).toBe(CAPTURE.ticks);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.tick).toBe(CAPTURE.ticks);
  });
});

/* ------------------------------- the picture ------------------------------ */

function draw() {
  return render(
    <LandingMotion>
      <StageShowcase />
    </LandingMotion>,
  );
}

const clockFace = (c: HTMLElement) => c.querySelector("[data-clock]")?.textContent;

describe("the capture frame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds its opening frame until the window is on screen", () => {
    const { container } = draw();

    expect(clockFace(container)).toBe("00:38");

    // Nothing has been reached yet, so nothing has moved.
    play(10_000);
    expect(clockFace(container)).toBe("00:38");
  });

  it("counts up for six seconds and then stops", () => {
    const { container } = draw();
    windowOnScreen(true);

    expect(clockFace(container)).toBe("00:38");

    play(2000);
    expect(clockFace(container)).toBe("00:40");

    play(2000);
    expect(clockFace(container)).toBe("00:42");

    play(2000);
    expect(clockFace(container)).toBe("00:44");

    // The point of the whole fix: a minute later it still reads 00:44, and it
    // is not a one-minute-long fake recording.
    play(60_000);
    expect(clockFace(container)).toBe("00:44");
  });

  it("never animates the level meter's layout geometry", () => {
    const { container } = draw();
    windowOnScreen(true);

    const bars = () => Array.from(container.querySelectorAll("[data-bar]"));
    expect(bars()).toHaveLength(28);

    /*
     * The flicker, and the transcript jitter under it, both came from these
     * bars carrying an inline `height` that was recomputed ten times a second.
     * Nothing may set a layout property on them again: a bar whose box changes
     * size drags the baseline of the row it sits in, and the whole transcript
     * with it.
     */
    const layoutProps = ["height", "top", "bottom", "marginTop", "width", "paddingTop"] as const;
    const noLayoutStyles = () =>
      bars().every((b) =>
        layoutProps.every((prop) => !(b as HTMLElement).style[prop]),
      );

    expect(noLayoutStyles()).toBe(true);
    play(1500);
    expect(noLayoutStyles()).toBe(true);
    play(CAPTURE.ticks * CAPTURE.tickMs);
    expect(noLayoutStyles()).toBe(true);

    // And the bars keep their identity: none added, none removed, ever.
    play(30_000);
    expect(bars()).toHaveLength(28);
  });

  it("stops pulsing the recording lamp once the demonstration is over", () => {
    const { container } = draw();
    windowOnScreen(true);

    expect(container.querySelector("[data-lamp]")?.getAttribute("data-lamp")).toBe(
      "pulsing",
    );

    play(CAPTURE.ticks * CAPTURE.tickMs);

    expect(container.querySelector("[data-lamp]")?.getAttribute("data-lamp")).toBe(
      "still",
    );
  });

  it("holds every word of the transcript from the very first frame", () => {
    const { container } = draw();

    /*
     * THE INVARIANT THAT KEEPS THE TRANSCRIPT STILL.
     *
     * Every word of all three utterances is in the DOM before the reader has
     * even reached the section, in its final position with its final metrics.
     * Arriving is a change of opacity. Because nothing is ever inserted, no
     * line can rewrap and no word already on screen can be pushed anywhere.
     */
    const words = () => Array.from(container.querySelectorAll("[data-word]"));
    const count = words().length;
    expect(count).toBeGreaterThan(30);

    const said = () => container.querySelectorAll('[data-word="said"]').length;
    expect(said()).toBe(0);

    // All the text, present and correct, while none of it has been revealed.
    const text = words().map((w) => w.textContent!.trim()).join(" ");
    expect(text).toContain("Let us start with pricing, because that is the one that has been open longest.");
    expect(text).toContain("I would hold the price and move the annual discount instead.");
    expect(text).toContain("Fifteen per cent on annual. Can you note the invoice copy?");

    windowOnScreen(true);

    // The count never moves, at any point in the sequence.
    play(1000);
    expect(words()).toHaveLength(count);
    play(2000);
    expect(words()).toHaveLength(count);

    play(CAPTURE.ticks * CAPTURE.tickMs);
    expect(words()).toHaveLength(count);
    expect(said()).toBe(count);

    play(30_000);
    expect(words()).toHaveLength(count);
    expect(said()).toBe(count);
  });

  it("reveals the words progressively rather than all at once", () => {
    const { container } = draw();
    windowOnScreen(true);

    const said = () => container.querySelectorAll('[data-word="said"]').length;
    const total = container.querySelectorAll("[data-word]").length;

    expect(said()).toBe(0);
    play(CAPTURE.firstWord * CAPTURE.tickMs + 500);
    const partway = said();

    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(total);

    play(CAPTURE.ticks * CAPTURE.tickMs);
    expect(said()).toBe(total);
  });

  it("stops the clock when the reader scrolls the section away", () => {
    const { container } = draw();
    windowOnScreen(true);

    play(1000);
    expect(clockFace(container)).toBe("00:39");

    windowOnScreen(false);
    play(10_000);

    // Settled rather than still counting behind a section nobody is looking at.
    expect(clockFace(container)).toBe("00:44");
  });

  /**
   * The handover, asserted on the band rather than on the frame.
   *
   * <p>The band sits outside the crossfade and reports the new stage
   * immediately; the frame underneath it does not, because
   * `AnimatePresence mode="wait"` holds the outgoing child until its exit
   * animation finishes and jsdom has no animation pipeline to finish it
   * against. Which of the three frames is drawn for which block of copy is
   * therefore verified in a browser — it was, at all five widths — and what is
   * worth pinning here is the part that would rot invisibly: that nothing is
   * still counting behind the frame on its way out.
   */
  it("hands over to the next stage without leaving the clock running", () => {
    const { container } = draw();
    windowOnScreen(true);

    play(1000);
    expect(clockFace(container)).toBe("00:39");

    centreCopy(1);

    // No lamp means the band is no longer drawing Capture.
    expect(container.querySelector("[data-lamp]")).toBeNull();

    // The frame on its way out holds the tick it was handed and goes no
    // further. Ten seconds later it still reads 00:39 — which is the whole
    // point: nothing is counting behind a picture nobody is looking at.
    play(10_000);
    expect(clockFace(container)).toBe("00:39");
  });
});

/* ------------------------- nothing endless anywhere ------------------------ */

/**
 * The configuration that would bring the bug back.
 *
 * <p>Read from the source, because these are all things that look perfectly
 * still in a jsdom snapshot and run forever in a browser: a `repeat: Infinity`
 * added to the meter would pass every other test in this file.
 *
 * <p>Comments are stripped first. The file documents at length what was taken
 * out and why — the two `setInterval`s, the `Math.random` that was never there,
 * the loop that must not come back — and prose describing a mistake must not
 * read as the mistake.
 */
describe("what the capture showcase may never contain", () => {
  const code = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "components/v2/landing/stage-showcase.tsx"),
      "utf8",
    );
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  };

  it("configures no endless animation", async () => {
    const src = await code();

    expect(src).not.toMatch(/repeat:\s*Infinity/);
    expect(src).not.toMatch(/repeatType/);
    expect(src).not.toMatch(/animation-iteration-count/);
    expect(src).toMatch(/repeat:\s*0/);
  });

  it("runs no interval, and no loop that would need one", async () => {
    const src = await code();

    // One bounded `setTimeout` chain is the only scheduling this file does.
    expect(src).not.toMatch(/setInterval\s*\(/);
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src.match(/setTimeout\s*\(/g) ?? []).toHaveLength(1);
  });

  it("generates no waveform geometry at random or in render", async () => {
    const src = await code();

    // Random amplitudes differ between the server pass and the client's, and
    // regenerating them whenever state changes is what flicker is.
    expect(src).not.toMatch(/Math\.random/);
    // The shape is built once, at module scope, and frozen into a constant.
    expect(src).toMatch(/const WAVE: number\[\]\[\] = Array\.from/);
  });

  it("uses no layout animation, which would reposition the transcript", async () => {
    const src = await code();

    // FLIP is exactly the movement this showcase exists to avoid.
    expect(src).not.toMatch(/layout(Id)?\s*[={]/);
  });
});
