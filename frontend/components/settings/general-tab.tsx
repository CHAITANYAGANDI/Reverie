"use client";

/**
 * General — who you are, what is done with it, and the way out.
 *
 * Four things, in the order somebody needs them: the identity block, the
 * language your meetings are held in, what Reverie does and does not do with a
 * recording, and the button that ends the account. The email switches and the
 * retention dials were the fourth and fifth and are tabs of their own now.
 *
 * Every field here is read by something. Your name is matched against the owner
 * of every action item, which is the only thing that turns a list of promises
 * into "my tasks". Language is sent with each transcription job: detection is
 * good and not perfect, and a wrong guess on a short or bilingual recording is a
 * transcript in a language nobody spoke. Department and Role used to sit here
 * too and were read by nothing at all — a form that asks for facts it never uses
 * is one people fill in for nothing, so they are gone.
 *
 * Email and password are the two Reverie may not own. The address is shown and
 * never editable, by any kind of account: it is the credential, so every route
 * to changing it is a route to losing an account, and it is fixed once the
 * account is made. The password is never Reverie's either — there is no password
 * column, so the change is handed to the provider, and a development session
 * has no provider and therefore nothing to rotate.
 *
 * Close Account is the section that deletes things, and it stays here: it is
 * not a schedule and not a preference, it is the way out of the account, and
 * the account is what this tab is about. Its endpoint had existed and worked
 * for months with nothing in the interface able to reach it — an account could
 * only be closed by calling the API by hand — which is the same reason the
 * retention dials briefly lived here too.
 */

import * as React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Globe, Lightbulb, Loader2, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { pathForTab } from "@/lib/settings-tabs";
import { identityPermissions } from "@/lib/identity-owner";
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useGetLanguagesQuery,
  useCloseAccountMutation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsError } from "@/components/settings/shared";
import { LEGAL_LINKS } from "@/lib/build-info";
import { SIGN_UP } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ProfileDialog,
  type ProfileForm,
  type ProfilePatch,
} from "@/components/settings/profile-dialog";
import { DELETE_PHRASE, confirmsDeletion } from "@/lib/privacy";

export function GeneralTab() {
  return (
    <div className="space-y-1">
      <IdentityBlock />
      <LanguageRow />
      <TrainingSection />
      <CloseAccountSection />
      <Footer />
    </div>
  );
}

/**
 * Name, photo, email and password.
 *
 * <p>Read-only until Edit is pressed. A settings page whose every field is an
 * input invites somebody to change one by accident while reading it, and this
 * block is read far more often than it is edited.
 */
function IdentityBlock() {
  const { userId, mode, profile } = useAuth();
  const prefs = useGetPreferencesQuery();
  const [update, { isLoading }] = useUpdatePreferencesMutation();
  const [editing, setEditing] = React.useState(false);

  /*
   * Two kinds of account, and until now this block could not tell them apart.
   * It asked whether the deployment used Clerk, which is true for a Google
   * sign-in and for an email-and-password sign-up alike -- so it offered a
   * password dialog to both, when only one of them has a password to rotate.
   * See lib/identity-owner.
   */
  const permissions = identityPermissions({
    mode,
    provider: profile.provider,
    hasPassword: profile.hasPassword,
  });

  // The provider's address is the real one under Clerk; Reverie's column is a
  // copy that can lag until the next sign-in.
  const name = prefs.data?.displayName || profile.name || "";
  const email = prefs.data?.email || profile.email || null;
  const passwordNote = permissions.password
    ? "Set here. Changing it signs out your other sessions."
    : permissions.owner === "external"
      ? `You sign in with ${permissions.ownerLabel}.`
      : "Development session — there is no password.";

  const initial: ProfileForm = {
    displayName: name,
    email: email ?? "",
    avatarUrl: prefs.data?.avatarUrl ?? "",
  };

  async function save(patch: ProfilePatch) {
    try {
      await update(patch).unwrap();
      setEditing(false);
      toast.success("Saved.");
    } catch (err) {
      toast.error(settingsError(err));
    }
  }

  return (
    <div className="border-b py-6">
      <div className="flex items-start gap-4">
        <Avatar url={prefs.data?.avatarUrl} name={name || userId} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">
            {name || <span className="text-muted-foreground">No name yet</span>}
          </p>
          <p className="truncate text-sm">
            {email ? (
              <a href={`mailto:${email}`} className="text-primary underline-offset-2 hover:underline">
                {email}
              </a>
            ) : (
              <span className="text-muted-foreground">No email address yet</span>
            )}
          </p>
          {/* Dots, and a sentence saying whose password they are. Reverie
              never sees it: Clerk holds it, and a development session is
              identified by a header and has none at all. */}
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="tracking-[0.2em]">•••••••••</span>
            <span className="text-xs">{passwordNote}</span>
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          className="shrink-0 gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <ProfileDialog
        open={editing}
        initial={initial}
        permissions={permissions}
        saving={isLoading}
        onClose={() => setEditing(false)}
        onSave={(patch) => void save(patch)}
      />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={120}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The language meetings are held in.
 *
 * <p>Auto-detect is the default and stays first, because it is the right answer
 * for anyone whose meetings are not all in one language. The list is served —
 * it is the eighteen languages transcription actually supports, and a picker
 * offering a nineteenth would be offering a transcript that cannot be made.
 */
function LanguageRow() {
  const prefs = useGetPreferencesQuery();
  const languages = useGetLanguagesQuery();
  const [update, { isLoading }] = useUpdatePreferencesMutation();

  async function choose(code: string) {
    try {
      await update({ defaultLanguage: code }).unwrap();
      toast.success("Saved.");
    } catch (err) {
      toast.error(settingsError(err));
    }
  }

  return (
    <Row
      icon={<Globe className="h-4 w-4" />}
      title="Language"
      description="Default language for your future conversations"
      action={
        <select
          aria-label="Default language"
          disabled={isLoading}
          value={prefs.data?.defaultLanguage ?? ""}
          onChange={(e) => void choose(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Detect automatically</option>
          {(languages.data ?? []).map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      }
    />
  );
}

/**
 * The section with nothing to switch.
 *
 * <p>Every competitor puts a toggle here, because they have something to ask
 * permission for. Reverie does not train models, so the honest version of this
 * section is a statement of who sees the data on the way to producing your
 * notes — and no switch, because a switch would imply there is a use to opt out
 * of.
 *
 * <p>It links down the page rather than across to a Security tab. That tab is
 * gone; what it used to promise — that you can see and delete what is held — is
 * now the next two sections.
 */
function TrainingSection() {
  return (
    <section aria-labelledby="training-heading" className="space-y-1 pt-6">
      <h2 id="training-heading" className="flex items-center gap-2 text-title-3 font-headline text-ink">
        <Lightbulb className="h-4 w-4 text-ink-3" /> Feedback and training
      </h2>
      <div className="space-y-2 border-b border-line py-4 text-callout text-ink-3">
        <p>
          <strong className="text-foreground">
            Reverie does not train on your meetings.
          </strong>{" "}
          Your recordings, transcripts and notes are not used to improve any
          model, are not reviewed by people here, and are not pooled with anybody
          else&apos;s.
        </p>
        <p>
          Producing your notes does mean sending the audio to a speech-to-text
          provider and the transcript to a language model. There is no switch on
          this section because there is nothing to switch off — a toggle here
          would imply a use that does not happen.
        </p>
        {/* Said here because it changed, and because it is the one part of
            the path that is not "after you press Save". Somebody reading this
            page is entitled to know that a meeting is being sent somewhere
            while it is still happening, not only afterwards. */}
        <p>
          <strong className="text-foreground">
            While you are recording, audio is streamed to that same speech-to-text
            provider as you speak
          </strong>{" "}
          — that is what produces the live text on the recording page. It goes
          from your browser to the provider directly, so the words appear without
          waiting for the meeting to end. The recording itself is still
          transcribed in full afterwards, and that fuller transcript is the one
          that is kept.
        </p>
        {/* The link moved with the section. It was `#data`, an anchor to the
            retention dials further down this tab; they are a tab of their own
            now, so this is a real navigation rather than a jump. Closing the
            account is still on this tab and is still below, so that half of
            the sentence stays a `below`. */}
        <p>
          How long any of it stays is{" "}
          <Link
            href={pathForTab("data")}
            className="text-brand-text underline-offset-2 hover:underline"
          >
            yours to set under Data Retention
          </Link>
          , and you can delete the whole account below.
        </p>
      </div>
    </section>
  );
}

/*
 * EMAIL AND DATA RETENTION ARE TABS NOW, and both were here.
 *
 * <p>`EmailSection` with its five switches, and `RetentionSection` with its two
 * dials, sat between the training paragraph and the close-account control. Both
 * arrived here for a good reason -- their endpoints had worked for months with
 * nothing in the interface able to reach them, and getting them on screen
 * mattered more than getting them in the right place -- and both outgrew it.
 *
 * <p>See components/settings/email-tab and components/settings/retention-tab.
 * Nothing about either behaviour changed in the move; what changed is that
 * General is one subject again.
 */

/**
 * The end of the account.
 *
 * <p>Closed rather than hidden behind a support request, and it says the size of
 * what goes first, because the number is the warning: "deletes 91 meetings" is
 * read and "this is permanent" is not.
 *
 * <p>The phrase is checked here so the button can be disabled and again by the
 * server so a client that skipped the check cannot delete an account with an
 * empty body. The point is that it cannot be produced by a stray click.
 */
function CloseAccountSection() {
  const { signOut, deleteIdentity, clearOnboarding, mode } = useAuth();
  const [close, { isLoading }] = useCloseAccountMutation();
  const [typed, setTyped] = React.useState("");
  const [open, setOpen] = React.useState(false);

  async function onClose() {
    try {
      const result = await close({ confirm: typed }).unwrap();
      toast.success(
        `Deleted ${result.meetings} meeting${result.meetings === 1 ? "" : "s"} and ` +
          `${result.storedObjects} recording${result.storedObjects === 1 ? "" : "s"}.`,
      );
      setOpen(false);
      setTyped("");

      /*
       * AND THE SIGN-IN ITSELF, which is the half that was missing.
       *
       * <p>Closing an account erased Reverie's data and left the credential
       * alone, so signing in again with the same Google account walked straight
       * back into an empty product — the row is simply re-provisioned. Deleting
       * the identity is what makes "delete my account" mean it, and it is also
       * what makes the same person coming back a genuinely new account with
       * onboarding ahead of it.
       *
       * <p>This order and not the other one: Reverie's data goes first because
       * erasing it needs a live session token, and destroying the identity ends
       * the session.
       *
       * <p>Only in clerk mode — dev mode has no identity to destroy and says so
       * by answering false, which is not a failure worth reporting.
       */
      const gone = (await deleteIdentity?.()) ?? false;
      if (mode === "clerk" && !gone) {
        /*
         * THE IDENTITY SURVIVED, SO IT MUST NOT GO ON CLAIMING TO BE ONBOARDED.
         *
         * <p>Reverie's data is gone either way. If this credential signs in
         * again it gets a freshly provisioned, empty row — and an identity
         * still carrying `onboardingCompleted` would walk straight into that
         * empty product with the two questions marked answered, which is the
         * exact state the flag exists to prevent. Forgetting it here means the
         * next sign-in is onboarded again, whether or not the deletion is ever
         * retried.
         *
         * <p>Before the message and not after: the message is the last thing
         * that happens on this screen before the sign-out, and an error thrown
         * on the way to it must not leave the flag standing.
         */
        try {
          await clearOnboarding?.();
        } catch {
          /* Nothing better to do, and the sentence below is still true. */
        }

        /*
         * Said out loud rather than swallowed, and never reported as a success.
         * The instance can refuse — self-service deletion is a dashboard
         * setting — and somebody who is told their sign-in was destroyed when
         * it was not will find out by signing in successfully, which is the
         * worst way to learn it.
         */
        toast.error("Your data is deleted. The sign-in itself could not be removed.");
      }

      /*
       * OUT TO THE SIGN-UP FORM.
       *
       * <p>Not the sign-in form: signing out ordinarily means "I will be back"
       * and lands there, and this account has just been deleted — offering to
       * sign into it would be the product not having noticed, and the attempt
       * could only fail. Not the landing page either, which was the last
       * answer: it is the front door for somebody deciding whether to try
       * Reverie, and this is somebody who already has, so the useful next
       * screen is the one that makes a new account.
       *
       * <p>This is also the navigation that used not to happen at all — see
       * lib/sign-out.
       */
      signOut?.(SIGN_UP);
    } catch (err) {
      toast.error(settingsError(err));
    }
  }

  return (
    <section aria-labelledby="close-heading" className="space-y-1 pt-6">
      <h2
        id="close-heading"
        className="flex items-center gap-2 text-lg font-semibold text-destructive"
      >
        <Trash2 className="h-4 w-4" /> Delete this account
      </h2>

      <div className="space-y-3 border-b py-4">
        {/*
          "Deletes everything, permanently" was true and is now very nearly
          true, which is worse. The free allowance is a lifetime one and used to
          be reset by deleting an account and making another, so a count of what
          it has spent now outlives the account (V69).

          <p>The strong half is kept and still first: everything you made is
          gone and gone for good. What follows is the exception, stated as what
          it is and what it cannot do — a sentence somebody can check against
          the Privacy & Demo Notice, which describes the same row.
        */}
        <p className="text-sm text-muted-foreground">
          Deletes your meetings, recordings, transcripts, notes and chats{" "}
          <strong className="text-foreground">permanently</strong>. Export
          anything you want to keep first. A count of the free minutes and
          imports already used is kept, so the free allowance cannot be reset by
          starting again; it holds no content and cannot restore any.
        </p>

        {open ? (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <label className="block text-sm" htmlFor="confirm-delete">
              Type <strong>{DELETE_PHRASE}</strong> to confirm.
            </label>
            <Input
              id="confirm-delete"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={DELETE_PHRASE}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
              >
                Keep my account
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!confirmsDeletion(typed) || isLoading}
                onClick={() => void onClose()}
              >
                {isLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete everything
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        )}
      </div>
    </section>
  );
}

function Row({
  icon,
  title,
  description,
  action,
  bare,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", !bare && "border-b py-4")}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * The documents that govern this, where there are any.
 *
 * <h2>What used to be here</h2>
 *
 * <p>A build line — "Version 0.0.0 — dev build" — and a link reading "How long
 * Reverie keeps what is yours". Both are gone.
 *
 * <p>The build line was written for a bug report that could be traced to a
 * commit, and in a deployment built without one it says "0.0.0 — dev build",
 * which traces to nothing and reads as unfinished software to anybody who is
 * not the person who built it. A version that cannot identify a build is not
 * worth the line it costs.
 *
 * <p>The link went to <code>#data</code>, which is the retention section on
 * this same page, a few hundred pixels away and reachable by scrolling. A
 * footer link to the middle of the page you are already on is furniture.
 *
 * <h2>What it says now, and what it stopped saying</h2>
 *
 * <p>It read "By using Reverie you agree to the …" and rendered nothing at all
 * unless a deployment had supplied both URLs. There is a privacy document in
 * the repository now — `app/privacy-policy`, the Privacy &amp; Demo Notice — so
 * `LEGAL_LINKS` carries it by default and this is no longer empty.
 *
 * <p>Which makes the sentence wrong. Reverie asks nobody to agree to anything:
 * there are no terms, no acceptance checkbox and no contract, so an agreement
 * sentence wrapped around a link to a *disclosure* would be inventing the one
 * thing the notice is careful not to claim. So the agreement framing appears
 * only where a deployment has actually supplied terms — which is the only case
 * where there is something to agree to — and otherwise the links stand on their
 * own.
 *
 * <p>Internal links are `next/link` in the same tab; an external policy still
 * opens in a new one. Sending somebody out of the product to read the product's
 * own page would be the sort of small wrongness nobody files a bug about.
 */
function Footer() {
  if (LEGAL_LINKS.length === 0) return null;
  // Terms are the only document anybody could be agreeing to. Its presence is
  // what decides the sentence, rather than a count of links.
  const agreeing = LEGAL_LINKS.some((link) => link.label === "Terms of Service");
  const links = LEGAL_LINKS.map((link, i) => (
    <React.Fragment key={link.href}>
      {i > 0 && (agreeing ? " and " : " · ")}
      {link.internal ? (
        <Link href={link.href} className="text-primary underline-offset-2 hover:underline">
          {link.label}
        </Link>
      ) : (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {link.label}
        </a>
      )}
    </React.Fragment>
  ));

  return (
    <div className="space-y-1 pt-8 text-center text-xs text-muted-foreground">
      <p>{agreeing ? <>By using Reverie you agree to the {links}.</> : links}</p>
    </div>
  );
}
