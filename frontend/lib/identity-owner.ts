/**
 * Who owns your password — and therefore where it can be changed.
 *
 * <h2>The question this answers</h2>
 *
 * <p>Reverie has two kinds of account and they are not the same underneath:
 *
 * <ul>
 *   <li><b>Signed up with Google.</b> Google authenticates, and Clerk holds no
 *       credential of its own for this person — so there is no password here
 *       to change.</li>
 *   <li><b>Signed up with an email and a password.</b> Clerk holds the
 *       credential, and the password is the account holder's to change from
 *       here.</li>
 * </ul>
 *
 * <p>The old rule could not tell them apart. It asked one question — "is this
 * deployment using Clerk?" — and answered both cases the same way, so somebody
 * who signed in with Google got a Change password button that could only fail,
 * because there is no current password to give it.
 *
 * <h2>The address is not in here</h2>
 *
 * <p>It used to be, with a whole vocabulary about where a changed one had to go.
 * It is gone because nobody changes their address in Reverie any more, whatever
 * kind of account they have — see lib/account-actions. The address is a display
 * on every screen that shows it, so there is nothing left to decide.
 *
 * <h2>The name is not in here either, and its absence is a correction</h2>
 *
 * <p>It used to be, locked for a Google account on the reasoning that the next
 * sign-in would rewrite an edit. That is true of the address and false of the
 * name: {@code UserService.provision} refreshes {@code users.email} from the
 * token on every request and never touches {@code display_name}, and every
 * screen reads Reverie's column first and falls back to the provider's only
 * when it is empty. The provider supplies the first value and owns nothing
 * after that.
 *
 * <p>The lock cost two real things. Onboarding could not ask a Google account
 * what to call somebody — it went straight to the language question — and
 * Settings then refused to let them change a name they had never been asked
 * for. Both over a rewrite that does not happen.
 *
 * <h2>Why an editable field that cannot save is worse than no field</h2>
 *
 * <p>A disabled input with a sentence beside it is understood in a second. A
 * form that accepts an edit and reverts it is the kind of bug people report as
 * data loss. That is the whole reason the password is decided here: a Change
 * password dialog on an account with no password anywhere can only fail.
 *
 * <p>So this fails closed: an account whose credential cannot be identified is
 * treated as somebody else's, and the password is locked rather than offered.
 */

/** Where the identity lives. */
export type IdentityOwner =
  /** Clerk, on Reverie's behalf: an email and password account made here. */
  | "reverie"
  /** An identity provider — Google today. */
  | "external"
  /** No provider at all: a dev build, identified by a header. */
  | "dev";

export interface Credential {
  /** `authStore.mode`: "clerk" or "dev". */
  mode: string;
  /**
   * The connected OAuth provider, lower-case and unprefixed — "google" — or
   * "" when the account has none.
   */
  provider: string;
  /** Whether Clerk holds a password for this account. */
  hasPassword: boolean;
}

export interface IdentityPermissions {
  owner: IdentityOwner;
  /*
   * There is no `email` here and no `name`, and both absences are answers
   * rather than omissions. The address on a Reverie account is fixed once it is
   * made, for every kind of account — see lib/account-actions. The display name
   * is Reverie's own column for every kind of account, so there is nothing left
   * to decide about that either.
   */
  password: boolean;
  /**
   * What to call whoever owns it, in a sentence: "Google", "your sign-in
   * provider". Empty when Reverie owns it and there is nothing to name.
   */
  ownerLabel: string;
}

/** Providers whose name is worth printing. Anything else gets the generic. */
const NAMES: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
  apple: "Apple",
};

export function identityOwner({ mode, provider, hasPassword }: Credential): IdentityOwner {
  if (mode !== "clerk") return "dev";
  /*
   * The provider wins over the password, and that order is deliberate. An
   * account that signed up with Google and later set a password still has
   * Google as the source of its address, and offering to edit that here would
   * be offering to edit a copy the next request overwrites.
   */
  if (provider) return "external";
  if (hasPassword) return "reverie";
  /*
   * Signed in under Clerk with neither a password nor a connection. Nothing
   * here knows what to do with that, so nothing here offers to change it —
   * every alternative ends in a form that fails on submit.
   */
  return "external";
}

export function identityPermissions(credential: Credential): IdentityPermissions {
  const owner = identityOwner(credential);
  const label = NAMES[credential.provider] || "your sign-in provider";

  switch (owner) {
    case "reverie":
      // Clerk holds the credential on Reverie's behalf, and this is the account
      // holder, so the password is theirs to rotate.
      return { owner, password: true, ownerLabel: "" };
    case "dev":
      // A header rather than a credential: there is no password in existence to
      // rotate.
      return { owner, password: false, ownerLabel: "" };
    case "external":
    default:
      return { owner, password: false, ownerLabel: label };
  }
}

/**
 * Clerk spells a connection `oauth_google` in some places and `google` in
 * others. One spelling reaches the rest of the app.
 */
export function normalizeProvider(raw: string | null | undefined): string {
  // Lower-cased first, then stripped. The other order leaves `OAuth_Google`
  // as `oauth_google`, which matches no name in the table and would tell
  // somebody their account is held by "your sign-in provider".
  return (raw || "").toLowerCase().replace(/^oauth_/, "");
}
