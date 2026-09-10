import Link from "next/link";
import { Lockup } from "@/components/v2/lockup";

/**
 * The frame the screens outside the app share: sign in, and sign up.
 *
 * <h2>Whose screen this is</h2>
 *
 * <p>These pages used to be a thin wrapper around Clerk's drop-in components,
 * on the reasoning that Reverie does not authenticate anybody so it should not
 * own the form. That reasoning held for the credential and not for the product:
 * the first screen anyone sees was a third party's, in a third party's type,
 * carrying a third party's name — and it was the one screen where Reverie had
 * to look like something. The credential is still Clerk's. The screen is ours,
 * built on its headless hooks, and nothing on it says Clerk.
 *
 * <h2>The composition</h2>
 *
 * <p>`design-demo/final/56-signin.html`. One column, 400px, centred on both
 * axes, on the same ground the app uses. No card: a bordered box floating on a
 * dark ground is the shape of a dialog, and this is not interrupting anything.
 * No split-screen marketing panel, no illustration, no testimonial. A mark, a
 * sentence, a form.
 *
 * <p>The eyebrow is `.v2-label` — sentence case, sans — rather than the
 * uppercase mono it was. Mono is this product's metadata voice for things that
 * are literally data: a timecode, a duration, a count. "Sign in" is none of
 * those; setting it in mono was borrowing the voice for the look.
 *
 * <p>The one atmospheric touch is the ambient wash, and it is the same one the
 * public page carries — the product's brand at fifteen percent with a trace of
 * the success green, top-anchored. It is doing the job a photograph would do on
 * a marketing page: giving the eye somewhere to land before the type starts.
 * Anything more would be decoration on a page whose job is to be got through
 * quickly.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  /** Where you are: "Sign in", "Step 2 of 2". */
  eyebrow: string;
  title: string;
  /** One or two lines. What this screen is for, or what happens next. */
  subtitle: React.ReactNode;
  children: React.ReactNode;
  /** The way to the other flow, or out. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen place-items-center px-6 py-16">
      {/*
       * Ambient, not decorative: it puts a horizon behind the type. A
       * background never paints outside its own box, so there is nothing here
       * to clip and no `overflow-hidden` — which on the landing page turned out
       * to be the thing that silently breaks `position: sticky` for everything
       * inside it.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_62%_at_50%_-12%,hsl(var(--brand)/0.15),transparent_62%),radial-gradient(80%_40%_at_82%_8%,hsl(var(--success)/0.05),transparent_70%)]"
      />

      <div className="relative z-10 w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-[34px] inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <Lockup size={21} />
        </Link>

        <p className="v2-label mb-2.5">{eyebrow}</p>
        <h1 className="text-title-1 font-headline text-ink">{title}</h1>
        <div className="mt-2.5 text-body leading-[1.55] text-ink-3">{subtitle}</div>

        <div className="mt-7">{children}</div>

        {/* No hairline above it. The rule was doing the work of a card on a
            screen that deliberately has neither. */}
        {footer ? <div className="mt-[26px] text-callout text-ink-4">{footer}</div> : null}
      </div>
    </div>
  );
}
