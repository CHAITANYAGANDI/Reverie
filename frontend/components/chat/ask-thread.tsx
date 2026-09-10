"use client";

/**
 * THE CONVERSATION, AS EXCHANGES RATHER THAN AS A LIST OF MESSAGES.
 *
 * <h2>Why it pairs them</h2>
 *
 * <p>The API returns a flat array of messages alternating user and assistant,
 * and both chats rendered it as exactly that: a `map` over messages, one bubble
 * each. Which is why the citations had nowhere to go. Evidence belongs to an
 * answer, an answer belongs to a question, and the references draw the three of
 * them as one block with the sources set beside it — a shape a flat list cannot
 * express, because the thing being laid out spans two array entries.
 *
 * <p>So the messages are paired here, once, and both surfaces render
 * `AskTurn`s. The pairing is also what the server already believes: there is no
 * endpoint that deletes an answer, only `deleteExchange`, which takes either
 * half and removes both. The interface was the only part still treating them as
 * independent.
 *
 * <h2>What it does with a pair that is not a pair</h2>
 *
 * <p>Both halves are optional and neither is assumed. A question whose answer
 * failed is a real state — the request 500s, the question is persisted, nothing
 * comes back — and so is an answer with no question, which is what the first
 * message looks like if a question is ever deleted out from under one. Pairing
 * strictly (`messages[i]`, `messages[i+1]`) would silently shift every exchange
 * in the thread by one from that point down, attaching each answer to the wrong
 * question. Walking the list and only filling an empty answer slot cannot do
 * that: the worst case is a lone bubble, which is the truth.
 *
 * <h2>Presentation only</h2>
 *
 * <p>No query, no mutation, no scope. It takes messages and callbacks because
 * the workspace chat and the meeting chat are different endpoints with
 * different conversation lists, and the one thing this file must never do is
 * make them look like one. `evidence` is a render prop for the same reason: a
 * workspace citation navigates to another meeting, a meeting citation seeks the
 * player on this page, and neither belongs in here.
 */

import * as React from "react";
import { ChatMessageBubble } from "@/components/chat-message";
import { PendingTurn } from "@/components/chat/pending-turn";
import { AskTurn } from "@/components/chat/ask-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatMessage } from "@/lib/types";
import type { PendingTurn as Pending } from "@/lib/pending-turn";

export interface AskExchange {
  /** The question's id where there is one, so React keys survive a refetch. */
  key: string;
  question: ChatMessage | null;
  answer: ChatMessage | null;
}

/**
 * One entry per question-and-answer, in the order they were said.
 *
 * <p>Exported for its own test: the interesting cases are the ragged ones, and
 * they are far easier to state against a function than to arrange in a chat.
 */
export function exchangesOf(messages: ChatMessage[] | undefined): AskExchange[] {
  if (!messages) return [];
  const out: AskExchange[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.role === "user") {
      out.push({ key: m.id, question: m, answer: null });
    } else if (last && last.answer === null) {
      // The question immediately above is still waiting for one. Note there is
      // no need to also check that it *has* a question: an exchange is only
      // ever pushed with one or with an answer, so an empty answer slot implies
      // a question above it. That condition was written and turned out to be
      // unreachable -- a mutation of it changed no behaviour and failed no
      // test, which is the only useful way to find out.
      last.answer = m;
    } else {
      // An answer with no question above it, or a second answer to a question
      // that already had one. Its own exchange either way, so nothing below it
      // shifts up into the wrong pair.
      out.push({ key: m.id, question: null, answer: m });
    }
  }
  return out;
}

export function AskThread({
  messages,
  loading,
  pending,
  onRetry,
  onDelete,
  deleting,
  evidence,
  resting,
}: {
  messages: ChatMessage[] | undefined;
  /** Nothing to show and something coming. Not "a request is in flight". */
  loading?: boolean;
  /** The question being asked right now — see lib/pending-turn. */
  pending?: Pending | null;
  onRetry?: () => void;
  /** Removes the question and its answer. Offered on the question only. */
  onDelete?: (messageId: string) => Promise<void>;
  deleting?: boolean;
  /** What this answer is built on, drawn by whichever chat owns it. */
  evidence?: (answer: ChatMessage) => React.ReactNode;
  /**
   * What to draw before there is a conversation: the identity, and what this
   * panel answers about.
   *
   * <p>A node rather than a string, because the two chats are asking about
   * different things and neither sentence belongs in here — see
   * components/chat/ask-resting. Optional, so a surface may still choose to
   * open on nothing at all.
   */
  resting?: React.ReactNode;
}) {
  const exchanges = React.useMemo(() => exchangesOf(messages), [messages]);

  /*
   * THE SKELETON, AND WHY IT DEFERS TO A PENDING TURN.
   *
   * <p>`&& !pending` is a bug fix, and the bug was visible: ask a question and
   * the question bubble and `Thinking…` appeared, vanished for about two
   * seconds, and came back. Reported from a screenshot of exactly that state.
   *
   * <p>The cause is that asking the first question of a *new* conversation
   * moves `conversationId` from null to an id — see `submit` in
   * lib/use-workspace-chat — which starts the messages query on a key with
   * nothing cached under it. Both surfaces compute
   * `isLoading = isFetching && !messages`, so for the length of that fetch
   * `loading` is true with a turn already on screen, and this branch replaced
   * it with two grey bars.
   *
   * <p>Which is not what the prop means. `loading` is documented as "nothing to
   * show and something coming", and a question in flight is emphatically
   * something to show — it is the only evidence the click did anything. The
   * resting branch below already made this distinction; this one was written
   * before there was a pending turn to make it about, and never caught up.
   *
   * <p>Fixed here rather than in either caller's `isLoading`, deliberately.
   * That value also feeds `isNew` and `showPrompts`, and widening it to mean
   * "and no pending turn either" would quietly change what the conversation
   * picker thinks a new chat is. The invariant belongs to the thread: never
   * take a turn off the screen to put a placeholder in its place.
   */
  if (loading && !pending) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  /*
   * NOTHING SAID YET.
   *
   * <p>`pending` counts as content: a question in flight is the first turn of
   * the conversation, and replacing it with a resting logo would take the
   * question off the screen the moment it was asked.
   *
   * <p>This used to render nothing at all — the panel opened as an empty field
   * from the header to the composer, which on `/ask` is most of a 1440px
   * window. The identity goes here and nowhere else in the thread: it is gone
   * the moment there is an answer to read.
   */
  if (exchanges.length === 0 && !pending && resting) return <>{resting}</>;

  return (
    /*
     * `space-y-9` and a hairline, not `space-y-9` alone.
     *
     * <p>The gap used to be the only thing separating one exchange from the
     * next -- no rule, no card, no avatar column -- and at `space-y-4` a
     * second question read as a continuation of the answer above it. Nine is
     * better and still not enough at six turns: seventy pixels under a
     * paragraph is a paragraph break, not a turn break, and the evidence
     * column beside it had nothing at all tying it to its own answer.
     *
     * <p>The rule is drawn by `AskTurn`, across both columns, so an exchange
     * is one band of the document. The spacing here is the gap that rule sits
     * in.
     */
    <div className="space-y-9">
      {exchanges.map((x) => (
        <AskTurn
          key={x.key}
          question={
            x.question && (
              <ChatMessageBubble
                message={x.question}
                onDelete={onDelete}
                deleting={deleting}
              />
            )
          }
          answer={
            x.answer && (
              // The answer's own top margin rather than a wrapper's gap: an
              // exchange with no question must not open with a blank line.
              //
              // `mt-5` rather than `mt-4`. The exchanges are ruled off from
              // each other now -- see `AskTurn` -- so the space inside a block
              // has to be visibly smaller than the space between blocks
              // without being so tight that the answer looks welded to the
              // question above it.
              <div className={x.question ? "mt-5" : undefined}>
                <ChatMessageBubble message={x.answer} />
              </div>
            )
          }
          evidence={x.answer ? evidence?.(x.answer) : undefined}
        />
      ))}

      {/* Last, always. It is the newest thing said and has not been persisted
          yet, so it cannot be in the list above.

          Wrapped, because it renders a fragment of two siblings — the question
          and either "Thinking…" or the failure — and inherits whatever spacing
          the thread has. At `space-y-9` the status line landed thirty-six
          pixels below the question it belongs to and read as a separate turn. */}
      {pending && (
        <div className="space-y-3">
          <PendingTurn turn={pending} onRetry={onRetry} />
        </div>
      )}
    </div>
  );
}
