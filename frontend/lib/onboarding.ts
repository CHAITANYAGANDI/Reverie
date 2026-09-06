/**
 * The two questions a new account is worth asking, and which of them apply.
 *
 * <h2>Two, and no third</h2>
 *
 * <p>A name and the language meetings are usually in. Both are settings that
 * already exist, that the product actually reads, and that are worth more
 * answered now than discovered later. There is no third step: the flow this
 * replaces ended on "You are set up" over Record / Import / Explore, which is a
 * screen of buttons that the product's own default page already carries — a
 * menu standing in front of the thing it is a menu of.
 *
 * <p>Nothing else is asked. No company, no team size, no role, no "how did you
 * hear about us" — Reverie has nowhere to put any of it, and a form that
 * collects what it never reads is asking somebody to work for you before you
 * have done anything for them.
 *
 * <h2>The count is derived, never written down</h2>
 *
 * <p>"Step 1 of 2" when the name is ours to collect, "Step 1 of 1" when the
 * identity provider already owns it. Signing up with Google means Google holds
 * the name — Settings says exactly that and disables the field — so asking here
 * would be the product contradicting itself two screens apart, and saving it
 * would write a copy into Reverie's column that then outranks Google's
 * everywhere.
 *
 * <p>So the steps are computed from the identity rather than declared, and the
 * label counts what is actually there. A hard-coded "of 2" over a one-step flow
 * is a progress indicator that lies on the only screen where somebody is still
 * deciding whether to trust the product.
 */

/** Where the completion flag lives on a Clerk identity. */
export const ONBOARDING_FLAG = "onboardingCompleted";

/** The steps this flow can have, in order. */
export type OnboardingStep = "name" | "language";

/**
 * Which steps apply to this account.
 *
 * @param collectsName whether the name is Reverie's to collect — see
 *   `identityPermissions`, which answers it from the provider and whether the
 *   account has a password of its own.
 */
export function stepsFor(collectsName: boolean): OnboardingStep[] {
  return collectsName ? ["name", "language"] : ["language"];
}

/**
 * Whether onboarding has been finished, read off whatever the identity carries.
 *
 * <p>Deliberately **not** inferred from whether the account has meetings, a
 * display name, or anything else somebody could have. An account with no
 * recordings has not necessarily skipped onboarding, and one with a name did
 * not necessarily get it from this flow — Google supplies it. Only the explicit
 * flag counts, so the answer cannot drift as the account fills up.
 *
 * <p>Unknown shapes read as *not* completed rather than completed: the cost of
 * asking twice is two skippable screens, and the cost of never asking is a
 * default nobody chose.
 */
export function onboardingCompleted(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>)[ONBOARDING_FLAG] === true;
}

/** "Step 1 of 2", or "Step 1 of 1" where the name is not ours to ask for. */
export function stepLabel(index: number, total: number): string {
  return `Step ${index + 1} of ${total}`;
}
