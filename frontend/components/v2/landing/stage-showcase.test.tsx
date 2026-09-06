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
 * <p>It is now forty ticks and then nothing. These tests pin both halves of
 * that: the demonstration reaches its last frame, and <b>no timer survives it</b>
 * — which is the half that would rot silently, because a frozen display looks
 * identical whether the interval behind it was stopped or merely ignored.
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
 * frame, that the reader sees 00:38 become 00:42, and that the picture is
 * genuinely still afterwards.
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
const barHeights = (c: HTMLElement) =>
  Array.from(c.querySelector("[data-level]")?.children ?? []).map(
    (b) => (b as HTMLElement).style.height,
  );

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

  it("counts up for four seconds and then stops", () => {
    const { container } = draw();
    windowOnScreen(true);

    expect(clockFace(container)).toBe("00:38");

    play(2000);
    expect(clockFace(container)).toBe("00:40");

    play(2000);
    expect(clockFace(container)).toBe("00:42");

    // The point of the whole fix: a minute later it still reads 00:42, and it
    // is not a one-minute-long fake recording.
    play(60_000);
    expect(clockFace(container)).toBe("00:42");
  });

  it("settles the level meter instead of redrawing it forever", () => {
    const { container } = draw();
    windowOnScreen(true);

    play(CAPTURE.ticks * CAPTURE.tickMs);
    const settled = barHeights(container);

    expect(settled.length).toBeGreaterThan(0);
    // Settled low, but not the flat hairline this meter draws for silence —
    // a silent meter under a red Recording chip is a contradiction.
    expect(settled.some((h) => parseInt(h, 10) > 2)).toBe(true);

    play(30_000);

    expect(barHeights(container)).toEqual(settled);
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

  it("brings in all three live lines and leaves none of them provisional", () => {
    const { container } = draw();
    windowOnScreen(true);

    play(CAPTURE.ticks * CAPTURE.tickMs);

    // The words are the demonstration's content; that they all arrive is the
    // part a reader would notice was missing.
    expect(container.textContent).toContain("Let us start with pricing");
    expect(container.textContent).toContain("I would hold the price");
    expect(container.textContent).toContain("Fifteen per cent on annual");
  });

  it("stops the clock when the reader scrolls the section away", () => {
    const { container } = draw();
    windowOnScreen(true);

    play(1000);
    expect(clockFace(container)).toBe("00:39");

    windowOnScreen(false);
    play(10_000);

    // Settled rather than still counting behind a section nobody is looking at.
    expect(clockFace(container)).toBe("00:42");
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
