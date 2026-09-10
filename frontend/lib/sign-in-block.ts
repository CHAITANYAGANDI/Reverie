/**
 * Why a password did not sign somebody in, said precisely.
 *
 * <h2>The sentence this replaces</h2>
 *
 * <p>"This account needs another step to sign in. Continue with Google, or
 * reset your password." — shown for <em>every</em> outcome that was not
 * `complete`, because the form checked one thing and gave up. It is not wrong,
 * and it is nearly useless: it names two remedies without saying which applies,
 * so somebody with a Google-only account reads "reset your password" and tries
 * to reset a password that does not exist.
 *
 * <p>Clerk already answers the question. A sign-in attempt comes back with a
 * status and, when it needs a first factor, the list of factors that would
 * actually work — so the account that has no password says so, by listing
 * `oauth_google` and not `password`. Everything here is reading that list
 * instead of guessing from it.
 *
 * <h2>What it will not do</h2>
 *
 * <p>It never says an account does not exist, and never distinguishes a wrong
 * password from an unknown address. Both are `signIn.create` throwing, handled
 * by `authErrorMessage`, and both deliberately produce the same sentence —
 * telling a stranger which addresses have accounts is an enumeration oracle.
 * This file only explains attempts that got far enough to come back describing
 * themselves.
 */

/** The parts of a sign-in attempt that say what to do next. */
export interface SignInBlock {
  /** `needs_first_factor`, `needs_second_factor`, `needs_new_password`, … */
  status: string | null;
  /** Strategy names Clerk says would work: `password`, `oauth_google`, … */
  firstFactors: string[];
}

/** How the providers Reverie offers are said out loud. */
const PROVIDER_NAMES: Record<string, string> = {
  oauth_google: "Google",
};

/**
 * Pulls the strategies out of whatever shape Clerk handed back.
 *
 * <p>Defensive because this is a third party's payload and the alternative to a
 * missing list is a crash on the sign-in form.
 */
export function factorStrategies(factors: unknown): string[] {
  if (!Array.isArray(factors)) return [];
  return factors
    .map((factor) =>
      factor && typeof factor === "object"
        ? (factor as { strategy?: unknown }).strategy
        : undefined,
    )
    .filter((strategy): strategy is string => typeof strategy === "string");
}

/**
 * The one sentence to show, or null where the attempt is not blocked at all.
 *
 * <p>Ordered by how specific the answer can be. The generic line is last and is
 * reached only when Clerk described a state this form genuinely cannot name.
 */
export function signInBlockMessage(block: SignInBlock): string | null {
  if (block.status === "complete") return null;

  const factors = block.firstFactors;
  const hasPassword = factors.includes("password");
  const oauth = factors.find((strategy) => strategy.startsWith("oauth_"));

  /*
   * The reported case. An account created with Google has no password, so
   * `password` is simply not among the factors that would work — which is
   * Clerk saying "there is nothing here to check that against", not "that was
   * the wrong password".
   */
  if (block.status === "needs_first_factor" && !hasPassword) {
    if (oauth) {
      const name = PROVIDER_NAMES[oauth] ?? "the provider you signed up with";
      return `This account has no password — it was created with ${name}. Use Continue with ${name} above.`;
    }
    if (factors.some((strategy) => strategy.includes("email_code"))) {
      return "This account has no password yet. Use Forgot it? to set one, and you will be signed in.";
    }
  }

  /*
   * A password that is right, on an account that may not keep using it. Clerk
   * asks for a new one before it will finish, and the reset flow this form
   * already draws is exactly that conversation.
   */
  if (block.status === "needs_new_password") {
    return "This account needs a new password before it can sign in. Use Forgot it? to set one.";
  }

  if (block.status === "needs_second_factor") {
    const second = oauth
      ? ` Continue with ${PROVIDER_NAMES[oauth] ?? "your provider"} instead.`
      : "";
    return `This account has two-step sign-in turned on, which this form does not carry yet.${second}`;
  }

  // Described, but not in terms this form can act on. Says so rather than
  // naming a remedy that may not apply.
  return "This account could not be signed in with a password. Continue with Google, or use Forgot it?.";
}
