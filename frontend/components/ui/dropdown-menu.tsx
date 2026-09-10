"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A menu closes when you dismiss it. Leaving the window is not dismissing it.
 *
 * Radix's menu root closes on window blur, unconditionally:
 *
 *     const handleBlur = () => handleOpenChange(false);
 *     window.addEventListener("blur", handleBlur);
 *
 * So switching browser tabs, alt-tabbing to another window, or opening dev
 * tools took any open menu with it, and coming back left a reader looking for
 * a menu they had not closed. There is no prop for it — the listener is inside
 * `Menu.Root` — so the only way past is to hold `open` out here and decline
 * that particular close.
 *
 * `document.hasFocus()` is what tells it apart from a real one. The blur
 * handler runs while the window is not focused; a click outside, Escape and
 * choosing an item all happen while it is. So a close asked for by an
 * unfocused window is the one to ignore, and every other dismissal is
 * untouched.
 *
 * Controlled callers are unaffected: `open` and `onOpenChange` pass through,
 * and they hear about the closes that survive the filter.
 */
function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolled;

  return (
    <DropdownMenuPrimitive.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !document.hasFocus()) return;
        if (open === undefined) setUncontrolled(next);
        onOpenChange?.(next);
      }}
      {...props}
    />
  );
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // `overflow-y-auto` and a max height, not `overflow-hidden`.
        //
        // A menu taller than the space under its trigger was clipped with no
        // way to reach the rest: the meeting's `⋯` ran past the bottom of a
        // 900px window and the items below the fold were unreachable by
        // pointer *and* by arrow key, because Radix scrolls the focused item
        // into view inside a scroller and there was not one.
        //
        // Radix measures the room it has and publishes it; using that rather
        // than a fixed `max-h-*` means the menu is as tall as the window
        // allows and scrolls only when it genuinely cannot fit.
        "z-50 min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

/**
 * A group of items behind one row, opening beside the menu rather than in it.
 *
 * <p>Eight summary templates inline made the `⋯` menu twice as long as the
 * eleven actions it exists for, and pushed the destructive rows off the bottom
 * of the screen. A submenu is one row until it is asked for.
 *
 * <p>Radix places it to the side with `avoidCollisions`, so it opens right on
 * a menu with room to its right and flips left when there is none — which is
 * the behaviour a right-hand `⋯` on a wide window needs and the opposite of
 * what a hard-coded side would give it.
 */
const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      // The same row as `DropdownMenuItem`, plus the chevron that says there
      // is more. `data-[state=open]` keeps it lit while its panel is up.
      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4",
      className
    )}
    {...props}
  >
    {children}
    {/* Always at the far end, whatever the label. `aria-hidden` because the
        trigger already reports itself as having a submenu. */}
    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-4" aria-hidden />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={sideOffset}
      /*
       * Measured at 390: with no room to its right Radix flips the panel to
       * the left of the trigger, and a 160px panel beside a menu that starts
       * at x=107 lands at x=-57 -- half of it off the screen. Padding is what
       * gives the collision logic somewhere to put it instead, so on a narrow
       * window it shifts back over its own parent rather than off the edge.
       */
      collisionPadding={collisionPadding}
      className={cn(
        // Scrolls for the same reason the root content does: a submenu opened
        // near the bottom of the window has less room than the list is long.
        "z-50 min-w-[10rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
