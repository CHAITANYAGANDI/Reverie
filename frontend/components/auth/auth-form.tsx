"use client";

/**
 * The parts a sign-in form is made of, so the three screens that use them
 * cannot drift apart.
 *
 * <p>Not shadcn's `Input` and `Button` directly: those are sized for dense
 * application chrome, and while these end up the same 40px height as the rest
 * of V2, they want quieter borders, a leading icon, and a focus ring that is
 * actually visible on a dark ground.
 *
 * <p>Everything here is a plain element with a label tied to it. A sign-in form
 * is the one place in a product where a password manager, a screen reader and a
 * keyboard all have to work first time.
 */

import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The box every input sits in.
 *
 * <p>A translucent white fill rather than a solid one, so a single value works
 * on any surface, and an inset ring rather than a border — a border would take
 * a pixel of layout and shift the text when the ring thickens on focus.
 */
/*
 * The ring belongs to the box, not to the input inside it.
 *
 * `app/globals.css` gives every focusable element one focus treatment and says
 * it is never suppressed — rightly. But a text input always matches
 * `:focus-visible` whatever the input modality, so with a ring on the box as
 * well there were two: one hugging the text and one around the field. This
 * moves that one indicator outwards rather than removing it. The input is
 * silenced by `INPUT` below and the box carries the ring in its place, which is
 * both what the approved artifact draws and the more legible of the two — it
 * outlines the whole control, including its icon.
 */
const BOX =
  "flex h-10 items-center gap-2.5 rounded-md bg-white/[0.04] px-3 " +
  "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))] " +
  "transition-[background-color,box-shadow] duration-press ease-soft " +
  "focus-within:bg-white/[0.06] " +
  "focus-within:shadow-[inset_0_0_0_1px_hsl(var(--brand)),0_0_0_3px_hsl(var(--brand)/0.18)]";

/**
 * A labelled field.
 *
 * <p>`autoComplete` is required rather than optional. It is what lets a
 * password manager fill this in, and the difference between `current-password`
 * and `new-password` is the difference between offering to fill and offering to
 * generate — getting it wrong is a form that fights the browser.
 *
 * <p>The label is a sibling of the input rather than its parent. Wrapping would
 * be shorter, but the hint slot holds a real `<button>` on the password field,
 * and a button inside a label fires the label's activation as well as its own.
 */
export function Field({
  label,
  hint,
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Shown to the right of the label: "Forgot it?", "At least 8 characters". */
  hint?: React.ReactNode;
  /** Sits inside the box, before the text. */
  icon?: LucideIcon;
  autoComplete: string;
}) {
  const id = React.useId();
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex items-center gap-3">
        <label htmlFor={id} className="text-foot font-headline text-ink-3">
          {label}
        </label>
        {hint ? <span className="ml-auto text-foot text-ink-4">{hint}</span> : null}
      </div>
      <div className={BOX}>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-ink-4" aria-hidden /> : null}
        <input
          id={id}
          {...props}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-body text-ink outline-none",
            "placeholder:text-ink-4 disabled:opacity-50",
            /* See BOX: the indicator moves to the parent, it does not vanish. */
            "focus-visible:shadow-none",
            props.className,
          )}
        />
      </div>
    </div>
  );
}

/**
 * A six-digit code, drawn as six boxes and typed into one input.
 *
 * <h2>Why one input under six boxes</h2>
 *
 * <p>Six real inputs is the usual way and it is worse in every respect that
 * matters here. It needs focus management, backspace handling and paste
 * splitting — all of which are bugs waiting to happen — and it hands a screen
 * reader six unlabelled fields instead of one field called Code. Worst of all
 * `autocomplete="one-time-code"`, which is what makes a phone offer the code
 * from the message that just arrived, only fills the box it is on.
 *
 * <p>So there is one input, transparent, stretched across all six boxes. It
 * takes the paste, the autofill, the password manager and the keyboard; the
 * boxes are `aria-hidden` decoration that read their contents back off its
 * value. The caret is drawn on whichever box is next.
 */
export function CodeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const digits = React.useMemo(() => Array.from({ length: 6 }, (_, i) => value[i] ?? ""), [value]);

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <div aria-hidden className="flex gap-[9px]">
          {digits.map((digit, i) => {
            /* The box the next keystroke lands in — never past the last one. */
            const here = focused && i === Math.min(value.length, 5);
            return (
              <span
                key={i}
                data-digit={digit ? "filled" : "empty"}
                className={cn(
                  "grid h-14 w-[46px] place-items-center rounded-[9px] bg-white/[0.04]",
                  "font-mono text-[22px] text-ink",
                  "transition-shadow duration-press ease-soft",
                  here
                    ? "shadow-[inset_0_0_0_1px_hsl(var(--brand)),0_0_0_3px_hsl(var(--brand)/0.18)]"
                    : "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))]",
                )}
              >
                {digit || (here ? <Caret /> : null)}
              </span>
            );
          })}
        </div>

        {/*
         * The real field. Transparent rather than `sr-only`, because it has to
         * stay where the boxes are: a phone puts its one-time-code suggestion
         * over the focused input, and an input parked off-screen puts the
         * suggestion off-screen with it.
         */}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          /* Same as the fields: the lit digit box is the focus indicator, so
             this does not draw a second ring around all six of them. */
          className="absolute inset-0 h-full w-full bg-transparent text-transparent caret-transparent outline-none focus-visible:shadow-none"
        />
      </div>
    </div>
  );
}

/** The blink the product uses everywhere it is waiting for a keystroke. */
function Caret() {
  return <span className="h-6 w-[1.5px] animate-recpulse bg-brand-text" />;
}

/**
 * The one action on the screen.
 *
 * <p>INK, not the accent. The V2 palette's own rule: "the primary button in
 * this product is INK — a Save button is not an observation, and an accent
 * spent on every button is an accent that means nothing."
 */
export function SubmitButton({
  children,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="submit"
      {...props}
      disabled={busy || props.disabled}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4",
        "text-body font-headline text-surface",
        "transition-opacity duration-press ease-soft hover:opacity-90",
        "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * Continue with Google.
 *
 * <p>Above the email fields, not below, because it is the shorter road and most
 * people take it. The mark is Google's own four-colour G: their brand
 * guidelines require it unaltered, and a monochrome stand-in on a button that
 * says Google is the kind of detail that reads as a phishing page.
 */
export function GoogleButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy?: boolean;
  /** "Continue with Google" reads the same for a sign-in and a sign-up. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2.5 rounded-md px-4",
        "text-body font-headline text-ink",
        "shadow-[inset_0_0_0_1px_rgb(var(--edge))]",
        "transition-colors duration-press ease-soft hover:bg-white/[0.04]",
        "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <GoogleMark className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** A hairline with a word in it, for the seam between the two ways in. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3.5">
      <span className="h-px flex-1 bg-line" />
      <span className="text-foot text-ink-5">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * Something worth saying before the form is touched — where the code went, and
 * how long it lasts.
 *
 * <p>The margin note, which is this product's signature: one rule on the left
 * and text, no fill and no border. A tinted panel here would read as an error.
 */
export function Notice({
  icon: Icon,
  children,
  role,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  /** `status` when it is the result of something the reader just did. */
  role?: "status";
}) {
  return (
    <div role={role} className="v2-note flex items-start gap-2.5 py-1">
      <Icon className="mt-[3px] h-[15px] w-[15px] shrink-0 text-brand-text" aria-hidden />
      <span className="flex-1 text-body leading-[1.5] text-ink-3">{children}</span>
    </div>
  );
}

/**
 * What went wrong, where it can be seen.
 *
 * <p>`role="alert"` so it is announced: somebody using a screen reader submits
 * a form and otherwise hears nothing at all. Above the fields rather than
 * beneath the button, because that is where the eye returns after a failed
 * submit.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="mb-3.5 rounded-md px-3 py-2.5 text-callout text-ink-2 shadow-[inset_0_0_0_1px_hsl(var(--danger)/0.4)]"
    >
      {children}
    </p>
  );
}
