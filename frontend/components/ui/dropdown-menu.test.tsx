import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The two things a menu has to do that this one could not.
 *
 * <h2>Why a layout assertion, in a primitive's test</h2>
 *
 * <p>jsdom lays nothing out, so "can it scroll" cannot be measured here. What
 * can be pinned is the declaration, and that is the whole of both bugs: the
 * content carried `overflow-hidden` and no height, so a menu taller than the
 * room under its trigger was clipped with the rest unreachable by pointer
 * *and* by arrow key — Radix scrolls the focused item into view, and there was
 * no scroller to do it in.
 *
 * <p>The real geometry is measured in a browser: at 1440×420 the meeting's
 * `⋯` capped at 269px against 428px of content, and scrolling to the end put
 * "Delete this meeting" in view.
 */

function menu(children: React.ReactNode) {
  return render(
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("a menu too tall for the window", () => {
  it("scrolls, rather than clipping what it cannot fit", async () => {
    menu(<DropdownMenuItem>Only item</DropdownMenuItem>);
    await userEvent.click(screen.getByText("Open"));

    const content = document.querySelector("[data-radix-menu-content]")!;

    expect(content).toHaveClass("overflow-y-auto");
    // Not `overflow-hidden`, which is what clipped it.
    expect(content.className).not.toMatch(/\boverflow-hidden\b/);
    // As tall as the window allows, measured by Radix rather than guessed:
    // a fixed `max-h-*` is either shorter than the room or taller than it.
    expect(content).toHaveClass("max-h-[var(--radix-dropdown-menu-content-available-height)]");
  });
});

describe("a group of items behind one row", () => {
  it("says there is more, and opens it beside the menu", async () => {
    /*
     * Eight summary templates inline made the meeting's menu twice as long as
     * the actions it exists for and pushed the destructive rows off the bottom
     * of a laptop window.
     */
    menu(
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Templates</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Standup</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
    await userEvent.click(screen.getByText("Open"));

    const trigger = screen.getByRole("menuitem", { name: /Templates/ });
    // The chevron is what tells a reader this row goes somewhere; `aria-haspopup`
    // is what tells everyone else.
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
    // Shut until asked for. That is the point of it.
    expect(screen.queryByRole("menuitem", { name: "Standup" })).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(await screen.findByRole("menuitem", { name: "Standup" })).toBeInTheDocument();
    const panels = document.querySelectorAll("[data-radix-menu-content]");
    expect(panels).toHaveLength(2);
    // And the panel scrolls for the same reason the root does: opened near the
    // bottom of a window it has less room than the list is long.
    expect(panels[1]).toHaveClass("overflow-y-auto");
  });
});
