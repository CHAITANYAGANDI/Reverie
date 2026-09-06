"use client";

/**
 * The first screen inside a new account.
 *
 * <h2>Two questions, and no third</h2>
 *
 * <p>A name and the language meetings are usually in. Both are settings that
 * already exist, that the product actually reads, and that are worth more
 * answered now than discovered later:
 *
 * <ul>
 *   <li><b>Your name.</b> It is what the account button and the owner column on
 *       an action item show. Prefilled where the provider knew it, which turns
 *       the step into a confirmation rather than a question — and skipped
 *       entirely where the provider <em>owns</em> it.</li>
 *   <li><b>The language your meetings are in.</b> Detection is good and it is
 *       fooled by a quiet opening minute, so a transcript in the wrong language
 *       is a real outcome that one tap here prevents. Detect automatically
 *       stays the default, because for most people it is right.</li>
 * </ul>
 *
 * <p><b>There is no activation step.</b> The flow this restores ended on "You
 * are set up" over Record a meeting / Import a recording / Explore Reverie —
 * three buttons standing in front of a product whose own default page already
 * offers all three. A menu in front of the thing it is a menu of is a screen
 * somebody has to get through rather than one that helps.
 *
 * <h2>The count is derived from the identity</h2>
 *
 * <p>"Step 1 of 2" where the name is Reverie's to collect, "Step 1 of 1" where
 * Google already holds it. Not a fixed two: a progress indicator that says "of
 * 2" over a one-step flow is a small lie on the one screen where somebody is
 * still deciding whether to trust the product. See lib/onboarding.
 *
 * <h2>Everything is skippable, and skipping counts as done</h2>
 *
 * <p>Because the account is already made. This is the offer of a head start,
 * not a gate — holding a working product behind questions is how a good first
 * minute becomes a closed tab. Skipping leaves the defaults, which are sound,
 * and records the flow as finished so nobody is asked twice.
 *
 * <h2>Where it sits</h2>
 *
 * <p>Inside `AuthGate`, because nothing here can be asked before there is a
 * token to save it with, and outside `AppShell` — a sidebar and a usage meter
 * drawn around a welcome screen is the application saying "you are already
 * here" while the screen says "let us begin".
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field, SubmitButton } from "@/components/auth/auth-form";
import { useAuth } from "@/lib/auth";
import { useGetLanguagesQuery, useUpdatePreferencesMutation } from "@/lib/api";
import { identityPermissions } from "@/lib/identity-owner";
import { stepsFor, stepLabel, type OnboardingStep } from "@/lib/onboarding";
import { HOME } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Auto-detect, which is the default and usually right. */
const AUTO = "";

export default function WelcomePage() {
  return (
    <AuthGate>
      <Welcome />
    </AuthGate>
  );
}

function Welcome() {
  const router = useRouter();
  const { mode, profile, isLoaded, onboardingCompleted, completeOnboarding } = useAuth();
  const [save] = useUpdatePreferencesMutation();
  const languages = useGetLanguagesQuery();

  /*
   * Already done, so do not ask again.
   *
   * <p>Read off the explicit flag and nothing else — never off whether the
   * account has meetings or a name, both of which somebody can have without
   * having seen this screen. Somebody who arrives here with a finished
   * onboarding is sent on rather than being walked through it a second time.
   */
  React.useEffect(() => {
    if (isLoaded && onboardingCompleted) router.replace(HOME);
  }, [isLoaded, onboardingCompleted, router]);

  /*
   * The name step exists only where the name is this account's to set. Signing
   * up with Google means Google holds it — Settings says exactly that and
   * disables the field — so asking here would be the product contradicting
   * itself two screens apart, and saving it would write a copy into Reverie's
   * column that then outranks Google's everywhere.
   */
  const permissions = identityPermissions({
    mode,
    provider: profile.provider,
    hasPassword: profile.hasPassword,
  });
  const steps = React.useMemo<OnboardingStep[]>(
    () => stepsFor(permissions.name),
    [permissions.name],
  );

  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [language, setLanguage] = React.useState(AUTO);
  const [leaving, setLeaving] = React.useState(false);

  /*
   * The provider's name, once it arrives.
   *
   * `useUser` resolves a moment after this mounts, so seeding state at first
   * render would seed it empty. A ref rather than a dependency on `name` keeps
   * this to "fill the box once, and never overwrite what somebody has typed".
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !profile.name) return;
    seeded.current = true;
    setName(profile.name);
  }, [profile.name]);

  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;

  /**
   * Save what was chosen, record the flow as finished, and go.
   *
   * <p>Answered and skipped end the same way. The flag is what stops the next
   * arrival being asked again, and a skip is a decision — leaving somebody to
   * be asked once per sign-in because they declined once is the behaviour this
   * whole screen is trying not to be.
   *
   * <p>A failed preference write does not hold anybody here. Both answers have
   * sound defaults and their own page in Settings; refusing entry to the
   * product because a preference did not save would be the worst possible first
   * minute.
   */
  async function finish() {
    setLeaving(true);
    try {
      const patch: { displayName?: string; defaultLanguage?: string } = {};
      if (permissions.name && name.trim()) patch.displayName = name.trim();
      if (language) patch.defaultLanguage = language;
      if (Object.keys(patch).length > 0) await save(patch).unwrap();
    } catch {
      /* deliberately swallowed — see above */
    }
    try {
      await completeOnboarding();
    } catch {
      /* the same reasoning: being asked twice is cheaper than being stuck */
    }
    router.replace(HOME);
  }

  /** Forward, or out — whichever this step is. */
  function advance() {
    if (last) {
      void finish();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <AuthShell
      eyebrow={stepLabel(step, steps.length)}
      title={
        current === "name"
          ? "What should we call you?"
          : "What language do you usually meet in?"
      }
      subtitle={
        current === "name"
          ? "It appears on your account, and beside the tasks assigned to you."
          : "Reverie detects this from the audio. Setting it helps when a meeting opens quietly."
      }
      footer={
        <div className="flex items-center justify-between">
          {/* A real sequence, so the markers carry real information: which of
              however many there are, and which are done. */}
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((id, i) => (
              <span
                key={id}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-ink" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={leaving}
            className="text-callout text-ink-3 underline-offset-[3px] transition-colors duration-press ease-soft hover:text-ink hover:underline disabled:opacity-60"
          >
            Skip for now
          </button>
        </div>
      }
    >
      {current === "name" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            advance();
          }}
        >
          <Field
            label="Name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="mt-6">
            <SubmitButton busy={leaving && last}>
              Continue <ArrowRight className="h-4 w-4" />
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div>
          <div
            role="radiogroup"
            aria-label="Default meeting language"
            className="max-h-[280px] space-y-0.5 overflow-y-auto"
          >
            <LanguageRow
              label="Detect automatically"
              detail="Recommended"
              selected={language === AUTO}
              onSelect={() => setLanguage(AUTO)}
            />
            {languages.data?.map((option) => (
              <LanguageRow
                key={option.code}
                label={option.name}
                detail={option.nativeName}
                selected={language === option.code}
                onSelect={() => setLanguage(option.code)}
              />
            ))}
            {languages.isLoading && (
              <p className="px-1 py-3 text-callout text-ink-4">Loading languages…</p>
            )}
          </div>
          <div className="mt-6">
            <SubmitButton type="button" busy={leaving} onClick={advance}>
              Continue <ArrowRight className="h-4 w-4" />
            </SubmitButton>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

/** One language. A radio in behaviour, a row in appearance. */
function LanguageRow({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
        "transition-colors duration-press ease-soft",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.035]",
      )}
    >
      <span className="flex-1 text-body text-ink">{label}</span>
      <span className="text-foot text-ink-4">{detail}</span>
      <Check
        className={cn("h-4 w-4 shrink-0 text-ink", selected ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    </button>
  );
}
