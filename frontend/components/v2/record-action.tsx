"use client";

/**
 * Record, meaning record.
 *
 * <p>IT NAVIGATES. IT DOES NOT OPEN THE MICROPHONE.
 *
 * <p>It used to do both — push the route and call `recorder.start()` on the way
 * — so capture began from a control in the application's chrome, and the page
 * that carries the responsibility disclosure loaded with the microphone
 * already live behind it. Whatever that page then said about informing the
 * room was said too late, and this was the surface that made it too late.
 *
 * <p>So this is a destination now. The allowance is still checked here, because
 * refusing before the journey is kinder than refusing after it, and the folder
 * is still remembered here, because this is the only moment it is knowable.
 * Starting belongs to the one button on /record that sits under the
 * disclosure; see `BeforeRecording` there.
 *
 * <p>One consequence is carried through rather than papered over: nothing is
 * asserted about consent any more, so nothing is claimed about it. See where
 * the meeting is created in components/recording-bar.tsx.
 *
 * <p>A hook rather than a button, because there are two buttons now. The band
 * carries one on a desktop and the bottom tabs carry one on a phone, and they
 * are the same act: the same allowance check, the same route push, the same
 * folder remembered. Two copies of this drift, and the copy that drifts is the
 * one on the phone, which is the harder one to notice.
 */

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAllowance, recordRefusal } from "@/lib/allowance";
import { recordHref, returnPath } from "@/lib/routes";
import { useRecording, useRecordingSession } from "@/lib/recording-context";

export interface StartRecording {
  /**
   * Push /record, or explain why not.
   *
   * <p>Named `start` because the control is named Record and the two buttons
   * calling it read better this way. It starts the *act* of recording, which
   * now begins with reading a page rather than with a microphone opening.
   */
  start: () => void;
  /**
   * Why this account cannot record, or null.
   *
   * <p>Not used to disable anything. A dead button explains nothing, and the
   * reason is the whole of what somebody needs here — so the control stays
   * pressable and answers.
   */
  refusal: string | null;
}

/**
 * @param from the pathname the control is being pressed on. A recording started
 *   inside a folder belongs in it, and by the time it is saved — minutes later,
 *   from /record or from wherever the user wandered — there is no folder in the
 *   pathname to read. It is also the way back from a discarded recording.
 */
export function useStartRecording(from: string): StartRecording {
  const recorder = useRecording();
  const session = useRecordingSession();
  const router = useRouter();
  const refusal = recordRefusal(useAllowance());

  function start() {
    // Checked here as well as on /record, because this is where the microphone
    // is actually opened. Navigating first and refusing on arrival would put
    // the browser's permission prompt in front of somebody who is about to be
    // told they cannot record anyway.
    if (refusal) {
      toast.error(refusal);
      return;
    }
    // /record?r=%2Ffolder%2Fprj_1 — the page this was pressed on, on the URL,
    // so that a reload of /record still knows where the recording came from.
    router.push(recordHref(from));
    if (recorder.state !== "idle") return;
    // And in memory, which is what survives navigating away from /record while
    // the meeting runs. This is the only moment the folder is knowable, and it
    // is remembered until the meeting is created. Set every time, so a
    // recording started from Home cannot inherit the last one's folder.
    session.setReturnTo(returnPath(from));
    // AND NOTHING ELSE. `recorder.start()` was called here; it is not any
    // more. Capture begins at the button under the disclosure on /record and
    // nowhere else, which is the whole of the fix -- a second surface that
    // could open a microphone is a second way to skip what that page says.
  }

  return { start, refusal };
}
