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
 * <h2>Both apply to every account, Google included</h2>
 *
 * <p>This briefly skipped the name where the provider had supplied one, so a
 * Google sign-up went straight to the language question and was never asked
 * what to call anybody. Google supplies the name; it owns nothing afterwards.
 * Reverie's {@code display_name} is its own column, the server never rewrites
 * it from the token, and every screen reads it before the provider's — so the
 * question is real, and the screen prefills it, which makes the step a
 * confirmation rather than an interrogation. See lib/identity-owner.
 *
 * <p>The count still comes from the list rather than a literal 2, so the label
 * cannot drift from what is on screen. A progress indicator that miscounts is a
 * small lie on the one screen where somebody is still deciding whether to trust
 * the product.
 */

/** Where the completion flag lives on a Clerk identity. */
export const ONBOARDING_FLAG = "onboardingCompleted";

/** The steps this flow can have, in order. */
export type OnboardingStep = "name" | "language";

/**
 * The steps, in order: the name, then the language, then Now.
 *
 * <p>A constant rather than a function of the identity, because both questions
 * are Reverie's own preferences and both therefore apply to every account. One
 * list, counted by the label and walked by the screen.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["name", "language"];

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

/** "Step 1 of 2", counted off the list rather than written as a literal. */
export function stepLabel(index: number, total: number): string {
  return `Step ${index + 1} of ${total}`;
}
