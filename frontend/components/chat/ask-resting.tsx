/**
 * AN ASK THREAD WITH NOTHING IN IT YET: one line, and what to ask it.
 *
 * <p>One line, centred. That is the whole component, and the restraint is the
 * design: what the reader needs from an empty panel is to know what it answers
 * and that it is theirs to type into.
 *
 * <h2>The orb is gone from here</h2>
 *
 * <p>It was 56px of the approved AI artwork above this line — the mark's
 * largest placement in the application. Withdrawn on request. Which leaves the
 * sentence doing the work alone, and it can: the panel is opened deliberately,
 * from a control that says `Ask Reverie`, so the reader already knows whose
 * panel it is by the time they see this.
 *
 * <h2>What it is not</h2>
 *
 * <p>It is not the composer. A previous pass centred the *input* in the empty
 * panel — the arrangement a lot of chat products use for a blank sheet — and it
 * was withdrawn on sight, because the first question sends the box to the foot
 * and the one control on the panel then moves the first time you use it. The
 * composer is docked at the bottom in every state; see the note where `empty`
 * used to be, in components/chat/ask-panel. This sits in the *thread's* space,
 * which is empty by definition and has nothing to displace.
 *
 * <p>And it is not a splash. It goes the moment there is a turn to read: an
 * answer built on four passages is a document, and a 56px logo above it would
 * be spending the top of the panel on a fact the header already states. The
 * identity retreats to the header's 26px orb, which is where it belongs once
 * there is something to read.
 *
 * <h2>Why the prompts are not here</h2>
 *
 * <p>Because they are already directly above the box they fill in — see
 * `ChatSuggestions`. Moving them up here would put a wall of chips where the
 * first answer is about to appear and leave the cursor at the far end of the
 * panel from the shortcut into it. This states what the panel is; the chips
 * state what you could ask; the box is where you ask it, and the three read
 * top to bottom in that order.
 */

export function AskResting({ label }: { label: string }) {
  return (
    /*
     * `h-full` and centred. The thread's region is `flex-1` with its own
     * scroll, so this takes exactly the space the conversation is not using —
     * and once there is a conversation this is not rendered at all, so the
     * centring can never fight with a turn for the same space.
     *
     * <p>`pb-6` rather than true centring: an optical centre sits slightly
     * above the geometric one, and the panel has a dock under it that the eye
     * counts as part of the box.
     */
    <div className="flex h-full flex-col items-center justify-center pb-6 text-center">
      {/* `--ink-2`, not `--ink`. It is an invitation rather than a heading, and
          the loudest thing in an empty panel should be the box. */}
      <p className="max-w-[24ch] text-body leading-[1.5] text-ink-2">{label}</p>
    </div>
  );
}
