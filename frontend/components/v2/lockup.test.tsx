import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Lockup } from "@/components/v2/lockup";

/**
 * THE LOCKUP, AND HOW MANY TIMES IT SAYS "REVERIE".
 *
 * <p>The mark carries `title="Reverie"`, which becomes the image's `alt`, and
 * the wordmark beside it is the same word — so by default the lockup is
 * announced twice. That is right in the band, where the mark may be the only
 * thing identifying the product and the accessible name of the nav is load
 * bearing; it is wrong on a document page where the word is unambiguously there
 * to be read.
 *
 * <p>Hence `decorative`, and hence this file: the default is asserted alongside
 * it, because "fix the redundancy" applied globally would silently rename the
 * nav, the auth shell and the SSO screen.
 */
describe("Lockup", () => {
  it("names itself through the mark by default", () => {
    const { container } = render(<Lockup size={21} />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "Reverie");
    expect(container.querySelector("[data-ai-mark]")).not.toHaveAttribute("aria-hidden");
  });

  it("hides the mark from a reader when asked, leaving the word to do it", () => {
    const { container } = render(<Lockup size={21} decorative />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("[data-ai-mark]")).toHaveAttribute("aria-hidden", "true");
    // The word is still there, and is now the only thing announced.
    expect(screen.getByText("Reverie")).toBeInTheDocument();
  });

  it("draws the word alone where the mark is withdrawn", () => {
    // The landing footer, which was asked for as the word by itself.
    const { container } = render(<Lockup size={14} muted mark={false} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Reverie")).toBeInTheDocument();
  });

  it("keeps the mark at full colour when the type is muted", () => {
    // `muted` quietens the line to `--ink-3` and must not touch the artwork:
    // recolouring it is the one thing the identity rules forbid, and there is
    // no monochrome version of a lit sphere that is still recognisably it.
    const { container } = render(<Lockup size={14} muted />);

    const image = container.querySelector("img")!;
    expect(image.className).not.toMatch(/opacity|grayscale|saturate|mix-blend/);
    expect(container.firstElementChild!.className).toContain("text-ink-3");
  });
});
