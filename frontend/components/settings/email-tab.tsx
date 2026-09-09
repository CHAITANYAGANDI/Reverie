"use client";

/**
 * Account Settings → Email.
 *
 * <h2>Why it is a tab again</h2>
 *
 * <p>It was the fourth section of General, under an identity block, a language
 * row and a paragraph about model training. Five switches about five different
 * messages is a subject rather than a subsection, and down there it was
 * something people scrolled past on the way to the button that ends the
 * account.
 *
 * <h2>Why the messages exist at all, given V56 deleted the tab this replaces</h2>
 *
 * <p>V56 removed every email and said why: the switches had no UI to reach
 * them, so nothing was going out and nobody could have turned anything on. It
 * also deleted the four messages, and it was right about those too — they
 * reported things the reader could see by opening the app.
 *
 * <p>Five messages came back that pass a different test: they reach somebody
 * who is <em>not</em> in Reverie, about something they cannot see from outside
 * it, while there is still something to do about it. Every one of them is off
 * until it is switched on here, which is the half V56 was missing.
 *
 * <h2>What is not on this list</h2>
 *
 * <p>Two messages have no switch and the page says so rather than hiding it:
 * running out of the allowance, and the account being closed. Neither is a
 * notification about the contents of an account. The second is the sharper
 * case — closing an account deletes the row these very switches live on, so by
 * the time it is sent there is nothing left to consult and no bell left to
 * ring.
 *
 * <p>Each switch saves on its own. A section of five toggles behind one Save
 * button is a section where flipping one thing and leaving loses it.
 */

import { toast } from "sonner";
import { Mail } from "lucide-react";
import { useGetPreferencesQuery, useUpdatePreferencesMutation } from "@/lib/api";
import { settingsError } from "@/components/settings/shared";

export function EmailTab() {
  const prefs = useGetPreferencesQuery();
  const [update, { isLoading }] = useUpdatePreferencesMutation();

  async function set(field: EmailSwitch, value: boolean) {
    try {
      await update({ [field]: value }).unwrap();
    } catch (err) {
      toast.error(settingsError(err));
    }
  }

  return (
    <section id="email" aria-labelledby="email-heading" className="space-y-1">
      <h2 id="email-heading" className="flex items-center gap-2 text-title-3 font-headline text-ink">
        <Mail className="h-4 w-4 text-ink-3" /> Email notifications
      </h2>
      <div className="space-y-3 py-4">
        <p className="text-callout text-ink-3">
          All off unless you turn them on. Reverie does not email you about
          things you can see by opening it.
        </p>

        {prefs.isLoading ? (
          <div className="space-y-2" aria-hidden>
            {EMAIL_SWITCHES.map((s) => (
              <div
                key={s.field}
                className="h-[58px] animate-pulse rounded-lg border border-line bg-surface-raised"
              />
            ))}
          </div>
        ) : prefs.isError || !prefs.data ? (
          <p role="alert" className="text-callout text-ink-3">
            Couldn&apos;t load your email settings. Reload the page to try again.
          </p>
        ) : (
          <div className="space-y-2">
            {EMAIL_SWITCHES.map((row) => (
              <label
                key={row.field}
                /* The whole row is the target, because the switch is 16px and
                   the sentence beside it is what somebody is reading when they
                   decide. `hover:border-edge` rather than a fill: five filled
                   rows in a column read as five cards. */
                className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-line bg-surface-raised p-3.5 transition-colors duration-press ease-soft hover:border-edge"
              >
                <span className="space-y-0.5">
                  <span className="block text-callout text-ink">{row.label}</span>
                  <span className="block text-foot text-ink-3">{row.detail}</span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs.data![row.field]}
                  disabled={isLoading}
                  onChange={(e) => void set(row.field, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
                />
              </label>
            ))}
          </div>
        )}

        {/* Said rather than hidden. A switch somebody cannot find reads as a
            message they cannot stop. */}
        <p className="pt-1 text-foot text-ink-4">
          Two messages have no switch: running out of transcription minutes, and
          your account being closed and its data deleted. Neither is about the
          contents of your account, and the second is sent after everything —
          including these settings — has been deleted.
        </p>
      </div>
    </section>
  );
}

type EmailSwitch =
  | "retentionWarningEmail"
  | "retentionAppliedEmail"
  | "taskReminderEmail"
  | "notesReadyEmail"
  | "allowanceEmail";

/**
 * In the order they matter, which is not the order they were built.
 *
 * <p>The warning first: it is the only one that arrives while there is still
 * something to do. Everything below it reports.
 */
const EMAIL_SWITCHES: { field: EmailSwitch; label: string; detail: string }[] = [
  {
    field: "retentionWarningEmail",
    label: "Before retention deletes something",
    detail: "A week's notice, and only when something is actually due.",
  },
  {
    field: "retentionAppliedEmail",
    label: "After retention deletes something",
    detail: "One message for the night's work, never one per meeting.",
  },
  {
    field: "taskReminderEmail",
    label: "Action items due tomorrow",
    detail: "One digest each morning, including anything overdue. Nothing when the list is empty.",
  },
  {
    field: "notesReadyEmail",
    label: "Notes ready for a long recording",
    detail: "Only above fifteen minutes — a short one is finished before you have left the page.",
  },
  {
    field: "allowanceEmail",
    label: "When your transcription minutes are nearly gone",
    detail: "Once, at 85%. There is nothing to buy; it is so you can choose what to record.",
  },
];
