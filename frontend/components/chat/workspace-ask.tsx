"use client";

/**
 * ASK REVERIE ACROSS THE WHOLE WORKSPACE, in whichever of its two places.
 *
 * <h2>Why there is one of these and not two</h2>
 *
 * <p>There were two: the `/ask` page drew this by hand, and Home had a link to
 * it. Both now render this — Home in the shell's side pane, `/ask` as a route —
 * because they are the same chat, over the same meetings, through the same
 * endpoints. The only differences are how big it is and whether it can be shut,
 * which is what `variant` and `onClose` are.
 *
 * <p>They still keep their own open thread. `surface` is what separates them
 * and it is the only thing it does — see `ChatSurface` in lib/use-workspace-chat
 * for why it must never reach a request.
 *
 * <h2>The meeting chat is not this</h2>
 *
 * <p>It looks the same on purpose and shares every presentation component here
 * — `AskPanel`, `AskThread`, `AskEvidence`, `ChatDock`. It does not share this
 * file, because it is a different endpoint with a different conversation list
 * and a different scope, and one component fetching "whichever of the two"
 * would be a data bug wearing a design fix.
 *
 * <h2>Where the citations point</h2>
 *
 * <p>Out. A workspace answer is built on passages from meetings the reader is
 * not looking at, so each one is a deep link into that meeting at that second —
 * no `onSeek`, which is the meeting chat's behaviour and would seek a player
 * that is not on the page.
 *
 * <p>The dates under those passages come from the meeting list this chat
 * already holds for its context picker. Nothing is fetched to draw them: a
 * request per citation is exactly the N+1 an evidence rail invites, and a
 * passage from a meeting outside that page simply shows its title and its
 * timecode.
 */

import * as React from "react";
import { useWorkspaceChat, type ChatSurface } from "@/lib/use-workspace-chat";
import { ChatComposer } from "@/components/chat-composer";
import { ChatHistory } from "@/components/chat-history";
import { ChatDock } from "@/components/chat/chat-shell";
import { AskPanel, type AskVariant } from "@/components/chat/ask-panel";
import { AskHeader } from "@/components/chat/ask-header";
import { AskThread } from "@/components/chat/ask-thread";
import { AskEvidence } from "@/components/chat/ask-evidence";
import { useThreadScroll } from "@/lib/use-thread-scroll";
import { WORKSPACE_PROMPTS, toPrompts } from "@/lib/chat-prompts";
import { useRotatingPrompts } from "@/lib/use-rotating-prompts";
import { useSidePane, toggleSidePaneExpanded, closeSidePane } from "@/components/side-pane";

export function WorkspaceAsk({
  surface,
  variant,
  onClose,
}: {
  surface: ChatSurface;
  variant: AskVariant;
  /** Absent on `/ask`, which is a destination rather than a summoned panel. */
  onClose?: () => void;
}) {
  const chat = useWorkspaceChat(surface);
  // Only for the maximise control's own state; the pane itself is the shell's.
  const pane = useSidePane();
  // An unfinished starter chip — "What did " — goes in the box rather than
  // being sent. The composer owns what is typed; this is only the handover.
  const [compose, setCompose] =
    React.useState<{ text: string; nonce: number } | null>(null);
  // The thread, not the document, and only while the reader is at the bottom of
  // it. See lib/use-thread-scroll.
  const threadRef = useThreadScroll([chat.messages, chat.pending]);
  const prompts = useRotatingPrompts(
    surface,
    toPrompts(chat.suggestions, WORKSPACE_PROMPTS),
    chat.conversationId,
  );

  // Rebuilt only when the catalogue changes, because it is a prop on every
  // passage in the thread.
  const meetingDates = React.useMemo(
    () => new Map(chat.meetings.map((m) => [m.id, m.createdAt])),
    [chat.meetings],
  );

  return (
    <AskPanel
      variant={variant}
      scrollRef={threadRef}
      /* The one condition, used twice: nothing in the thread means the starter
         chips are offered AND the composer sits in the middle of the panel
         rather than across the foot of a blank one. See `empty` on the panel
         and `showPrompts` in lib/use-workspace-chat -- both are "no turns,
         nothing loading, nothing in flight". */
      empty={chat.showPrompts}
      header={
        <AskHeader
          onClose={onClose}
          actions={
            /* Block and full width, so `ChatHistory`'s own `ml-auto` puts New
               chat and maximise at the end of the row. */
            <div className="min-w-0 flex-1">
              <ChatHistory
                conversations={chat.conversations}
                activeId={chat.conversationId}
                atNewChat={chat.isNew}
                busy={chat.starting}
                /*
                 * In the pane it maximises in place. On `/ask` there is no
                 * control at all.
                 *
                 * <p>It used to be drawn and refused there, on the reasoning
                 * that a button missing from one of three surfaces reads as a
                 * panel that has lost something. In practice it reads as a
                 * broken button: a permanently greyed arrow-in glyph in the
                 * corner of the page, whose only message is about a state the
                 * page can never leave. `/ask` is reached from the band, where
                 * it is plainly a page and not a panel, so there is nothing to
                 * explain. New chat is still there and is the only thing in
                 * that corner now.
                 */
                onExpand={variant === "pane" ? toggleSidePaneExpanded : undefined}
                expanded={variant === "pane" ? pane.expanded : undefined}
                onSelect={chat.setConversationId}
                onNew={() => void chat.startNew()}
                onRename={chat.rename}
                onDelete={chat.remove}
              />
            </div>
          }
        />
      }
      dock={
        <ChatDock
          /* No horizontal padding of its own: `AskPanel` owns the panel's
             gutters, and the dock's own `px-4` inside them put the composer
             thirty-two pixels in from the thread above it. */
          className="px-0 pb-0"
          prompts={prompts}
          showPrompts={chat.showPrompts}
          busy={chat.asking}
          onSend={(q) => void chat.send(q)}
          onCompose={(prefix) => setCompose({ text: prefix, nonce: Date.now() })}
        >
          <ChatComposer
            busy={chat.asking}
            modes={chat.modes}
            mode={chat.mode}
            onModeChange={chat.setMode}
            context={chat.context}
            onContextChange={chat.setContext}
            meetings={chat.meetings}
            projects={chat.projects}
            compose={compose}
            onSend={chat.send}
          />
        </ChatDock>
      }
    >
      <AskThread
        messages={chat.messages}
        loading={chat.isLoading}
        pending={chat.pending}
        onRetry={chat.retry}
        onDelete={chat.removeExchange}
        deleting={chat.deleting}
        evidence={(answer) => (
          <AskEvidence citations={answer.citations} meetingDates={meetingDates} />
        )}
      />
    </AskPanel>
  );
}

/**
 * Home's copy, mounted the first time somebody asks for it.
 *
 * <h2>Why it is not simply always mounted</h2>
 *
 * <p>Because the workspace chat's wiring is five queries — conversations,
 * suggestions, modes, a page of meetings and the folders — and Home is the
 * default page. Mounting it with the pane shut would put all five on every
 * visit to the app in order to have a panel ready that most visits never open.
 *
 * <h2>And why it stays mounted once it has been</h2>
 *
 * <p>Because closing this pane must not throw work away. A question still being
 * answered lives in a module store and would survive, but a half-typed one, the
 * chosen mode and the context chips are component state and would not — so
 * shutting the panel to read the list behind it and opening it again would come
 * back to an empty box. Staying mounted while hidden costs nothing: the shell's
 * `aside` is `hidden` when the pane is shut.
 *
 * <p>Which leaves "opening Ask gives you a new chat" to be produced by
 * navigation rather than by unmounting — see lib/chat-route.ts. Leaving Home
 * forgets the thread; coming back and opening this offers a clean sheet, and
 * closing it here on Home does not.
 *
 * <p>That separation is the point. If this unmounted on close, the panel's
 * lifetime would decide the conversation again, and closing the pane to read
 * the list behind it would be indistinguishable from leaving the page.
 */
export function WorkspaceAskPane() {
  const pane = useSidePane();
  const [everOpened, setEverOpened] = React.useState(false);

  React.useEffect(() => {
    if (pane.open) setEverOpened(true);
  }, [pane.open]);

  if (!everOpened) return null;
  return <WorkspaceAsk surface="home" variant="pane" onClose={closeSidePane} />;
}
