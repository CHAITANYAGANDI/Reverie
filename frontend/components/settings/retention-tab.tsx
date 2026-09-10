"use client";

/**
 * Account Settings → Data Retention.
 *
 * <h2>Why it is a tab</h2>
 *
 * <p>It was the fifth section of General. This is the one place in the product
 * that deletes things on a schedule, and a schedule that runs every night and
 * cannot be found is the worst version of the feature — it spent months as an
 * endpoint with no interface at all, which is how it came to be bolted onto
 * General in the first place. Getting it on screen mattered more than where.
 * Now it has a place.
 *
 * <h2>Two dials, not one</h2>
 *
 * <p>Because "how long do you keep the recording of my voice" and "how long do
 * you keep the notes" are asked by different people. Everyone who was in the
 * room can ask the first; only the account holder cares about the second. "A
 * week for the recording, forever for the notes" is a coherent and common
 * answer, and one number cannot say it.
 *
 * <p><strong>Both dials are sent on every change.</strong> The API reads a null
 * as "keep forever" rather than "leave this one alone" — the opposite of every
 * other patch in it — because the two constrain each other and a partial update
 * from a stale render is how somebody ends up with a rule they did not set.
 *
 * <p>The choices that would break that constraint are disabled rather than
 * offered and refused. The server's message is a good one, but a control that
 * exists to be clicked and then rejected is a control that wasted a click.
 */

import { toast } from "sonner";
import { AlertTriangle, Clock } from "lucide-react";
import { useGetPrivacyOverviewQuery, useUpdateRetentionMutation } from "@/lib/api";
import { settingsError } from "@/components/settings/shared";
import { RETENTION_CHOICES, retentionLabel } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export function RetentionTab() {
  const overview = useGetPrivacyOverviewQuery();
  const [update, { isLoading }] = useUpdateRetentionMutation();
  const policy = overview.data?.retention;

  async function choose(which: "audio" | "meeting", days: number | null) {
    if (!policy) return;
    try {
      await update({
        audioDays: which === "audio" ? days : policy.audioDays,
        meetingDays: which === "meeting" ? days : policy.meetingDays,
      }).unwrap();
      toast.success("Saved.");
    } catch (err) {
      toast.error(settingsError(err));
    }
  }

  return (
    <section id="data" aria-labelledby="retention-heading" className="space-y-1">
      <h2
        id="retention-heading"
        className="flex items-center gap-2 text-title-3 font-headline text-ink"
      >
        <Clock className="h-4 w-4 text-ink-3" /> How long things are kept
      </h2>
      <p className="pb-2 text-callout text-ink-3">
        Nothing is deleted on a schedule until you choose one here. Both start at
        Never.
      </p>

      <div className="space-y-6 py-4">
        {overview.isLoading || !policy ? (
          <p className="text-callout text-ink-3">
            {overview.isLoading
              ? "Loading your policy…"
              : "Couldn't load your retention policy. Reload the page to try again."}
          </p>
        ) : (
          <>
            <Dial
              label="Delete the recording"
              hint="The audio goes. The transcript, summary and action items stay."
              value={policy.audioDays}
              disabled={isLoading}
              // Refused by the server, because a recording rule that the meeting
              // rule deletes out from under is a rule that never runs.
              blocked={(days) =>
                policy.meetingDays !== null && days !== null && days > policy.meetingDays
                  ? "Longer than the whole meeting is kept."
                  : null
              }
              onChoose={(days) => void choose("audio", days)}
              dueNow={policy.recordingsDueNow}
              dueNoun="recording"
            />
            <Dial
              label="Delete the whole meeting"
              hint="Everything about it: the recording, the transcript, the notes and its action items."
              value={policy.meetingDays}
              disabled={isLoading}
              blocked={(days) =>
                policy.audioDays !== null && days !== null && days < policy.audioDays
                  ? "Shorter than the recording is kept."
                  : null
              }
              onChoose={(days) => void choose("meeting", days)}
              dueNow={policy.meetingsDueNow}
              dueNoun="meeting"
            />
            <p className="border-t border-line pt-4 text-foot text-ink-4">
              Age is counted from when a meeting was created, not from when you
              last opened it — otherwise the recording of a sensitive
              conversation survives longest precisely because people keep going
              back to it. Reverie checks once a day and tells you what it took.
              Deletion is immediate and cannot be undone.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * One retention window, as three buttons.
 *
 * <p>Buttons rather than a select. There are three options and the current one
 * is the answer to a question somebody is uneasy about — it should be readable
 * without opening anything.
 */
function Dial({
  label,
  hint,
  value,
  disabled,
  blocked,
  onChoose,
  dueNow,
  dueNoun,
}: {
  label: string;
  hint: string;
  value: number | null;
  disabled: boolean;
  blocked: (days: number | null) => string | null;
  onChoose: (days: number | null) => void;
  dueNow: number;
  dueNoun: string;
}) {
  const offList = !RETENTION_CHOICES.some((c) => c.days === value);

  return (
    <div>
      <p className="text-callout font-headline text-ink">{label}</p>
      <p className="mb-2.5 text-foot text-ink-3">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {RETENTION_CHOICES.map((choice) => {
          const reason = blocked(choice.days);
          const off = disabled || reason !== null;
          return (
            <button
              key={String(choice.days)}
              type="button"
              disabled={off}
              title={reason ?? undefined}
              aria-pressed={value === choice.days}
              onClick={() => onChoose(choice.days)}
              /* The chosen one takes the accent, which in this product means
                 "this is in effect" rather than "this is the primary action" —
                 the same reading the margin's Open pill and a citation have. */
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-foot transition-colors duration-press ease-soft",
                value === choice.days
                  ? "border-brand bg-brand/12 font-headline text-brand-text"
                  : "border-line text-ink-2 hover:border-edge hover:text-ink",
                off && "cursor-not-allowed opacity-50",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>

      {/* A window set through the API, or left over from a longer list. Named
          rather than drawn as none of the three, which would read as Never. */}
      {offList && (
        <p className="mt-2 text-foot text-ink-3">
          Currently {retentionLabel(value).toLowerCase()}, which is not one of
          these. Choosing one replaces it.
        </p>
      )}

      {dueNow > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-foot text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This deletes {dueNow} {dueNoun}
          {dueNow === 1 ? "" : "s"} you already have, at the next daily pass.
        </p>
      )}
    </div>
  );
}
