"use client";

/**
 * On or off, for a thing that takes effect immediately.
 *
 * <h2>Why this is a button and not a dependency</h2>
 *
 * <p>`role="switch"` with `aria-checked` is the whole of the accessible switch
 * pattern, and a native `<button>` already brings the keyboard with it: Space
 * and Enter activate it, Tab reaches it, and the focus ring is the browser's
 * until told otherwise. Adding `@radix-ui/react-switch` would buy a hidden
 * input this form does not submit.
 *
 * <p>The state is not carried by colour alone — the knob is at the other end of
 * the track, which is what a reader who cannot tell the two fills apart is
 * actually reading. That is a requirement rather than a nicety.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
  }
>(({ checked, onCheckedChange, className, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full",
      "transition-colors duration-press ease-soft",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      checked ? "bg-brand" : "bg-white/[0.14]",
      disabled && "cursor-not-allowed opacity-50",
      className,
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        "block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-press ease-soft",
        checked ? "translate-x-[1.375rem]" : "translate-x-[0.125rem]",
      )}
    />
  </button>
));
Switch.displayName = "Switch";
