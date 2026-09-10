"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AUTH_MODE,
  DEFAULT_DEV_USER,
  DEV_USER_KEY,
  authStore,
  publishAuthState,
} from "@/lib/auth-store";
import { clearPreferences } from "@/lib/preference-store";
import { ONBOARDING_FLAG } from "@/lib/onboarding";

/** Where dev mode keeps the onboarding flag, one per dev user. */
const devFlagKey = (userId: string) => `reverie.${ONBOARDING_FLAG}.${userId}`;
import { SIGN_IN } from "@/lib/routes";

interface AuthContextValue {
  mode: "dev" | "clerk";
  /** Current user id (dev id in dev mode, Clerk user id in clerk mode). */
  userId: string;
  /** Dev-only: switch the active dev user. No-op in clerk mode. */
  setDevUserId: (id: string) => void;
  /**
   * Identifies the current sign-in, for anything stored in the browser that
   * must not outlive it — see lib/preference-store.ts.
   *
   * <p>Clerk's session id where there is one, because that is the thing that
   * actually changes when somebody signs out and back in; the dev user id in
   * dev mode, which has no sessions and so relies on `signOut` clearing up
   * after itself.
   *
   * <p>Empty until `isLoaded`. Nothing scoped to a sign-in should be read
   * before then, or it will be read under the wrong one.
   */
  sessionKey: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  /**
   * End the session and leave.
   *
   * <p>Lands on the sign-in form by default, because the ordinary reason to
   * sign out is to stop — and a marketing page is not what somebody who has
   * just left their own account came for. `to` is for the one case where that
   * is wrong: closing an account, which goes to the sign-up form instead. That
   * account is gone, so a form offering to sign into it would be the product
   * not having noticed, and the only way back in is to make a new one.
   *
   * <p>It ends somewhere else whatever the revoke does. Under Clerk that is not
   * automatic — see lib/sign-out.
   */
  signOut?: (to?: string) => void;
  /**
   * Whether the two onboarding questions have been answered or skipped.
   *
   * <p>An explicit flag, never inferred from what the account contains. An
   * account with no meetings has not necessarily skipped onboarding, and one
   * with a display name did not necessarily get it from this flow — Google
   * supplies it. See lib/onboarding.
   *
   * <p>`false` until `isLoaded`, because the honest answer before the identity
   * has arrived is "not known", and the screen that reads it treats not-known
   * the same as not-done: two skippable questions is a cheap wrong answer.
   */
  onboardingCompleted: boolean;
  /**
   * Record that onboarding is finished — answered or skipped, which are the
   * same thing to this flag.
   *
   * <p>Resolves when it has been written, so the screen can leave knowing the
   * next arrival will not be asked again.
   */
  completeOnboarding: () => Promise<void>;
  /**
   * Forget that onboarding was ever finished.
   *
   * <p>For the one case that produces it: closing an account destroys Reverie's
   * data, the identity deletion is refused, and the credential survives. That
   * identity must not go on claiming to be onboarded — the next sign-in gets a
   * freshly provisioned, empty Reverie row, and walking somebody into an empty
   * product with the questions already marked answered is the exact state this
   * flag exists to prevent.
   *
   * <p>Not called by an ordinary sign-out. Signing out is not losing anything.
   */
  clearOnboarding: () => Promise<void>;
  /**
   * Destroy the sign-in itself, not just Reverie's copy of the account.
   *
   * <p>Closing an account erases Reverie's data; this is the other half, and
   * without it the credential survives and signing in with the same Google
   * account walks straight back into an empty product. Returns whether the
   * identity is actually gone, because the instance can refuse — self-service
   * deletion is a setting — and telling somebody their sign-in was destroyed
   * when it was not is worse than telling them it could not be.
   */
  deleteIdentity: () => Promise<boolean>;
  /**
   * Who the person is, as the identity provider knows them.
   *
   * <h3>Why this is here rather than fetched</h3>
   *
   * <p>The account button showed `user_3IUiqZSNuF0gbjwWA...` — an opaque id
   * that tells the reader nothing and, worse, looks like somebody else's
   * account. It fell back to the id because the two things it preferred were
   * both empty: `users.display_name` is only ever set by hand in Settings, and
   * `users.email` is null for most Clerk accounts, because Clerk's default
   * session token carries no email claim (see `EMAIL_CLAIMS` in
   * AuthenticationFilter — it needs a JWT template).
   *
   * <p>Meanwhile the browser already had all of it. Signing in with Google
   * hands Clerk a name, an address and a picture, and `useUser()` has them
   * client-side with no request at all. So the provider carries them, and the
   * name somebody chose in Settings still wins where they have chosen one.
   *
   * <p>Empty strings rather than nulls: every consumer is rendering these into
   * a string, and `""` is falsy in the one expression that matters.
   */
  profile: UserProfile;
}

/** What the identity provider knows about the person signed in. */
export interface UserProfile {
  /** "Ada Lovelace", or "" if the provider has no name for them. */
  name: string;
  /** Their primary address, or "". */
  email: string;
  /** A photo URL, or "". */
  imageUrl: string;
  /**
   * The connected OAuth provider — "google" — or "" for an account made with
   * an email and a password.
   *
   * <p>This is what decides whether the profile page offers to change a name,
   * an address and a password, or explains that Google holds them. See
   * lib/identity-owner: an account signed in through Google has no password to
   * rotate and an address that the next sign-in would overwrite.
   */
  provider: string;
  /** Whether Clerk holds a password for this account. */
  hasPassword: boolean;
}

/** Dev mode has an id and nothing else — there is no provider to ask. */
export const NO_PROFILE: UserProfile = {
  name: "",
  email: "",
  imageUrl: "",
  provider: "",
  hasPassword: false,
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Dev-mode provider: a persisted dev user id, sent as X-Dev-User. */
function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = React.useState(DEFAULT_DEV_USER);
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    let stored = DEFAULT_DEV_USER;
    try {
      stored = window.localStorage.getItem(DEV_USER_KEY) || DEFAULT_DEV_USER;
    } catch {
      /* ignore */
    }
    authStore.devUserId = stored;
    setUserId(stored);
    setIsLoaded(true);
  }, []);

  const setDevUserId = React.useCallback((id: string) => {
    const next = id.trim() || DEFAULT_DEV_USER;
    authStore.devUserId = next;
    try {
      window.localStorage.setItem(DEV_USER_KEY, next);
    } catch {
      /* ignore */
    }
    setUserId(next);
    /*
     * Switching dev user is a change of tenant, with no navigation and no
     * sign-in to notice it -- so it is published as a new generation for the
     * same reason a Clerk session change is. The gate closes, SessionCacheGuard
     * empties the previous user's API cache and claims the new one, and the
     * gate reopens. Without this the next request is answered from the
     * previous dev user's entries.
     *
     * The token half stays `proven`: dev mode's header comes from
     * `authStore.devUserId`, which was set on the line above, so there is
     * nothing asynchronous to prove.
     */
    publishAuthState({ sessionId: `dev:${next}`, phase: "proven" });
  }, []);

  /**
   * Dev mode has no session to end, but it does have a stored identity — and
   * leaving it in place is not harmless. Closing an account calls `signOut`, and
   * with nothing behind it the browser carried on as the user it had just
   * deleted, re-provisioning that id on the next request. Forgetting the stored
   * id and reloading drops the cached data with it.
   */
  const signOut = React.useCallback((to?: string) => {
    try {
      window.localStorage.removeItem(DEV_USER_KEY);
      /*
       * The onboarding flag is deliberately NOT removed here.
       *
       * <p>Signing out is not losing anything. It briefly did clear it, which
       * made dev mode ask the two questions again on every single sign-in —
       * the flag is keyed on the dev user id and signing back in as the same
       * dev user is the same person, who has already answered.
       *
       * <p>What destroys it is `deleteIdentity`, which is the deletion path and
       * dev mode's only version of "this identity is gone".
       */
    } catch {
      /* ignore */
    }
    // Dev mode signs back in as the same id, so the session key alone would not
    // notice this happened. See lib/preference-store.ts.
    clearPreferences();
    authStore.devUserId = DEFAULT_DEV_USER;
    window.location.href = to ?? SIGN_IN;
    // Nothing from the render, now that the onboarding flag is no longer
    // touched here. It briefly needed `userId` for the key it was clearing, and
    // leaving that dependency behind would re-create this callback on every dev
    // user switch for no reason.
  }, []);

  /*
   * DEV MODE HAS NO IDENTITY PROVIDER, so it has nowhere to put this but the
   * browser.
   *
   * <p>Under Clerk the flag lives on the identity, which is what makes the
   * whole lifecycle work: destroying the identity destroys the flag, so the
   * same Google account coming back after a full deletion is a new identity
   * with nothing on it and is asked again. Dev mode has no identity to destroy
   * and no server row of its own to key on, so it keeps the flag beside the dev
   * user id it already stores — and `deleteIdentity` clears it, which is dev
   * mode's only version of the same event. An ordinary sign-out leaves it
   * alone, because signing out is not losing anything.
   */
  const [devOnboarding, setDevOnboarding] = React.useState(false);
  React.useEffect(() => {
    try {
      setDevOnboarding(window.localStorage.getItem(devFlagKey(userId)) === "1");
    } catch {
      /* a browser with storage refused is a browser that asks again */
    }
  }, [userId]);

  const completeOnboarding = React.useCallback(async () => {
    setDevOnboarding(true);
    try {
      window.localStorage.setItem(devFlagKey(userId), "1");
    } catch {
      /* the screen still leaves; it is two questions, not a gate */
    }
  }, [userId]);

  const clearOnboarding = React.useCallback(async () => {
    setDevOnboarding(false);
    try {
      window.localStorage.removeItem(devFlagKey(userId));
    } catch {
      /* ignore */
    }
  }, [userId]);

  /*
   * There is no identity in dev mode, so there is nothing to destroy and
   * nothing to claim was destroyed — hence `false`, honestly.
   *
   * <p>It still forgets the onboarding answers, because this is the deletion
   * path and dev mode's flag is the only thing standing in for the identity
   * that a Clerk deletion would take with it. Without this, closing a dev
   * account and signing back in landed in an empty product that thought the
   * questions had been answered.
   */
  const deleteIdentity = React.useCallback(async () => {
    await clearOnboarding();
    return false;
  }, [clearOnboarding]);

  const value: AuthContextValue = {
    mode: "dev",
    userId,
    setDevUserId,
    onboardingCompleted: devOnboarding,
    completeOnboarding,
    clearOnboarding,
    deleteIdentity,
    // Dev has no sessions. The id is the only thing that distinguishes one
    // sign-in from another, and switching dev users is a sign-in.
    sessionKey: isLoaded ? userId : "",
    isSignedIn: true,
    isLoaded,
    signOut,
    // Nothing to know. Dev mode has an id, and the account button says
    // "Development session" under it rather than pretending to a name.
    profile: NO_PROFILE,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Clerk provider is loaded lazily and only in clerk mode, so dev builds never
// need a Clerk key and the Clerk SDK is not evaluated during SSR of dev pages.
const ClerkAuthProvider = dynamic(
  () => import("@/lib/clerk-auth").then((m) => m.ClerkAuthProvider),
  { ssr: false }
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (AUTH_MODE === "clerk") {
    return <ClerkAuthProvider AuthContext={AuthContext}>{children}</ClerkAuthProvider>;
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}

export { AuthContext };
export type { AuthContextValue };
