import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The record page.
 *
 * <p>There is no half before the recording any more, and most of this file is
 * about keeping it that way. Arriving opens the microphone: the route is only
 * ever reached by pressing Record, and a page answering that press with a
 * second button asking whether you meant it is a step that exists to be clicked
 * through. The two states left are the browser deciding, and the browser having
 * said no.
 *
 * <p>Several of these are negative, and deliberately so. There used to be a
 * second capture mode that recorded another browser tab, and most of what it
 * left behind was warnings: about Chrome, about sharing the wrong surface,
 * about having captured only one side of a conversation. With one source those
 * are not stale copy, they are copy that reports the product as broken.
 *
 * <p>The other thing held here is the sentence saying the transcript comes
 * after you stop. Reverie has no live transcription: the audio is captured in
 * the browser and only reaches the pipeline on Stop. A blank pane that looked
 * like it was waiting for words would promise captions the product does not
 * have, and the obvious conclusion to draw from it is that the microphone is
 * broken.
 */
const { announceRecording, push } = vi.hoisted(() => ({
  announceRecording: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

/**
 * The allowance, as the gate reads it. Generous by default so every test that
 * is not about the limit behaves as it did before there was one; the ones that
 * are about it narrow this in place.
 */
let usage = {
  plan: "FREE",
  minutesUsed: 0,
  minutesLimit: 100,
  importsUsed: 0,
  importsLimit: 3,
  meetingsUsed: 0,
};

vi.mock("@/lib/api", () => ({
  useGetUsageQuery: () => ({ data: usage, isLoading: false, isError: false }),
  useGetPreferencesQuery: () => ({ data: { displayName: "Sam Okafor", defaultLanguage: null } }),
  useCreateUploadUrlMutation: () => [vi.fn()],
  useCreateMeetingMutation: () => [vi.fn()],
  useGetLanguagesQuery: () => ({ data: [] }),
  useGetProjectQuery: (id: string) => ({ data: { id, name: "Q4 planning" } }),
  useUpdatePreferencesMutation: () => [vi.fn()],
}));

const recorder = vi.hoisted(() => ({ current: null as unknown }));
const session = vi.hoisted(() => ({ current: null as unknown }));
const savejob = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/recording-context", () => ({
  useRecording: () => recorder.current,
  useRecordingSession: () => session.current,
  useRecordingJob: () => savejob.current,
}));

import RecordPage from "@/app/(app)/record/page";
import { RECORDING_ANNOUNCEMENT } from "@/lib/privacy";
import type { UseSaveJob } from "@/lib/use-save-job";
import type { UseRecorder } from "@/lib/use-recorder";
import type { LiveTurn, UseLiveTranscript } from "@/lib/use-live-transcript";
import type { RecordingSession } from "@/lib/recording-context";

const start = vi.fn().mockResolvedValue(undefined);
const setTitle = vi.fn();
const setReturnTo = vi.fn();

function aTranscript(overrides: Partial<UseLiveTranscript> = {}): UseLiveTranscript {
  return {
    supported: true,
    status: "listening",
    turns: [],
    pending: null,
    error: null,
    reconnects: 0,
    clear: vi.fn(),
    ...overrides,
  };
}

/** One settled turn, as the streaming provider hands it over. */
function aTurn(overrides: Partial<LiveTurn> = {}): LiveTurn {
  return {
    id: "1:1:0",
    turnKey: "1:1",
    at: 0,
    speaker: "Speaker 1",
    speakerKey: "spk_1",
    speakerRaw: "A",
    speakerStatus: "attributed",
    text: "Hello.",
    final: true,
    ...overrides,
  };
}

function aJob(overrides: Partial<UseSaveJob> = {}): UseSaveJob {
  return {
    phase: "idle",
    job: null,
    busy: false,
    stopping: false,
    save: vi.fn(),
    stop: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

function renderPage(
  overrides: Partial<UseRecorder> = {},
  sessionOverrides: Partial<RecordingSession> = {},
  jobOverrides: UseSaveJob = aJob(),
) {
  savejob.current = jobOverrides;
  session.current = {
    title: "",
    setTitle,
    returnTo: null,
    setReturnTo,
    transcript: aTranscript(),
    ...sessionOverrides,
  } satisfies RecordingSession;
  recorder.current = {
    state: "idle",
    elapsed: 0,
    startedAt: null,
    level: 0,
    silentSeconds: 0,
    error: null,
    result: null,
    supported: true,
    devices: [],
    deviceId: null,
    setDeviceId: vi.fn(),
    liveSource: null,
    start,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } satisfies UseRecorder;
  return render(<RecordPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  usage = { ...usage, minutesUsed: 0, importsUsed: 0 };
  // The address bar is shared state in jsdom, and half of these arrive at
  // /record with something on it.
  window.history.replaceState({}, "", "/record");
});

describe("RecordPage on arrival", () => {
  /**
   * THE DISCLOSURE GAP THIS CLOSES.
   *
   * <p>Arriving here used to open the microphone, and the line about making
   * sure the room has been told rendered underneath the result. Read in order
   * that is a product asking people to inform the room after it has started
   * listening to it, and no amount of rewording the line fixes it: what was
   * needed was a moment before capture at all.
   *
   * <p>So mounting is inert now, and these are the halves of that -- nothing
   * starts, one thing is offered, the browser is not asked, and the press does
   * what the arrival used to.
   */
  it("opens no microphone merely because the route mounted", async () => {
    renderPage();

    // Given time to do it, if it were going to.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start recording/ })).toBeInTheDocument(),
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("offers exactly one thing to press", () => {
    renderPage();

    // One action, named after what it does. No tick box: that was removed on
    // request and is not coming back, because a box to tick is a click to get
    // past and a product that then behaves as though the room agreed.
    expect(screen.getByRole("button", { name: /Start recording/ })).toBeInTheDocument();
    expect(document.querySelector("input[type=checkbox]")).toBeNull();
    expect(screen.queryByRole("button", { name: /I have|confirm|agree/i })).not.toBeInTheDocument();
  });

  it("does not ask the browser for anything until it is pressed", () => {
    renderPage();

    // "Waiting for permission" belongs to the requesting state and to nothing
    // else. On an idle recorder it was a page announcing a prompt nobody had
    // asked for.
    expect(screen.queryByText(/Waiting for permission/i)).not.toBeInTheDocument();
  });

  it("says what the browser is being asked once it is asking", () => {
    renderPage({ state: "requesting" });

    // The permission prompt is modal and draws over the page. Nothing behind it
    // gives no clue what is being asked for or by whom.
    expect(screen.getByText(/Waiting for permission/i)).toBeInTheDocument();
  });

  it("starts the recording when the one button is pressed", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /Start recording/ }));

    // The existing start flow, unchanged, reached from the only control on this
    // route that reaches it.
    await waitFor(() => expect(start).toHaveBeenCalledWith());
  });

  it("asks nothing that has only one answer", () => {
    renderPage();

    // There was a choice here between capturing another tab and capturing the
    // room. Only the room is left, and a picker with one option is a question
    // asked for the sake of asking.
    expect(screen.queryByRole("button", { name: /Online meeting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /In person/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("tells the server nothing about having started", async () => {
    // There was a fire-and-forget POST here whose only purpose was a "Recording
    // started" notification for the account's other devices. On the device
    // doing the recording that announced a timer, a waveform and a red Stop
    // button already on screen -- one more row in a bell that had too many. The
    // notification went, so the endpoint went with it.
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Start recording/ }));

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(announceRecording).not.toHaveBeenCalled();
  });

  it("remembers where it was opened from", async () => {
    // /record?r=%2Ffolder%2Fprj_1 — the Otter shape, and the only thing a
    // reload of this page still has. The header's Record button says the same
    // in memory, but memory is what a reload just threw away.
    window.history.replaceState({}, "", "/record?r=%2Ffolder%2Fprj_1");

    renderPage();

    // Which is where the meeting files and where Discard goes back to. Held as
    // the path rather than the folder id: those are the same fact, and two
    // copies of one fact are two things that can disagree.
    await waitFor(() => expect(setReturnTo).toHaveBeenCalledWith("/folder/prj_1"));
  });

  it("takes Home when it was opened from nowhere in particular", async () => {
    renderPage();

    await waitFor(() => expect(setReturnTo).toHaveBeenCalledWith("/home"));
  });

  it("does not overwrite where a running recording came from", () => {
    // Reaching /record again while a recording started in a folder is under
    // way — the back button, a second press. The recording still belongs to
    // that folder, and the URL now says otherwise.
    window.history.replaceState({}, "", "/record");

    renderPage({ state: "recording" }, { returnTo: "/folder/prj_1" });

    expect(setReturnTo).not.toHaveBeenCalled();
  });

  it("says which folder the meeting will land in, and links to it", () => {
    renderPage({ state: "recording" }, { returnTo: "/folder/prj_1" });

    // Said now rather than discovered later: the folder was chosen a screen ago
    // and several minutes before the meeting will exist. A link, because it is
    // also the way back — leaving mid-recording is safe, the recorder lives in
    // the shell.
    const link = screen.getByRole("link", { name: "Q4 planning" });
    expect(link).toHaveAttribute("href", "/folder/prj_1");
  });

  it("says nothing about a folder when it was not started in one", () => {
    renderPage({ state: "recording" }, { returnTo: "/home" });

    // "Folder: —" reads as a missing value rather than as a meeting that
    // belongs nowhere in particular.
    expect(screen.queryByText(/Folder:/)).not.toBeInTheDocument();
  });

  it("does not reopen a microphone that is already open", () => {
    renderPage({ state: "recording" });

    // Coming back to the page mid-meeting, or pressing Record twice. A second
    // getUserMedia would restart the recorder and lose what was captured.
    expect(start).not.toHaveBeenCalled();
  });

  it("does not reopen it over audio that has not been saved", () => {
    renderPage({
      state: "stopped",
      result: { file: new File([""], "take.webm"), durationSeconds: 12 },
    });

    expect(start).not.toHaveBeenCalled();
  });

  it("draws nothing at all while the save hands over to the meeting", () => {
    // The real sequence: a finished recording, then `save()` releasing the
    // audio a tick before the route changes. Drawing the idle state in that gap
    // puts "Waiting for permission…" on screen as though a recording were about
    // to start — the last thing somebody sees of a meeting they just saved.
    const view = renderPage({
      state: "stopped",
      result: { file: new File([""], "take.webm"), durationSeconds: 12 },
    });

    recorder.current = { ...(recorder.current as UseRecorder), state: "idle", result: null };
    savejob.current = aJob({ phase: "processing" });
    view.rerender(<RecordPage />);

    expect(screen.queryByText(/Waiting for permission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again/)).not.toBeInTheDocument();
  });

  it("does not announce the empty allowance over the save that just emptied it", async () => {
    // The gap was that only the microphone half of the page respected the
    // hand-over. The allowance notice below it renders on `!started` — which is
    // precisely what releasing the audio makes true — and creating the meeting
    // invalidates the usage cache, so a recording that spent the last of the
    // balance put a destructive-tinted "There is nothing left to record with"
    // across the middle of the page at the moment the save succeeded, and then
    // navigated away from it. True, and read as the save having failed.
    usage = { ...usage, minutesUsed: 100 };
    const view = renderPage({
      state: "stopped",
      result: { file: new File(["x"], "take.webm"), durationSeconds: 12 },
    });

    recorder.current = { ...(recorder.current as UseRecorder), state: "idle", result: null };
    savejob.current = aJob({ phase: "processing" });
    view.rerender(<RecordPage />);

    expect(screen.queryByText(/There is nothing left to record with/)).not.toBeInTheDocument();
    // And nothing else either: a page being handed over has nothing to say.
    expect(view.container).toBeEmptyDOMElement();
  });

  it("still says the allowance is spent when nothing is being handed over", async () => {
    // The guard above must not swallow the refusal it exists to time.
    usage = { ...usage, minutesUsed: 100 };

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/There is nothing left to record with/)).toBeInTheDocument(),
    );
  });

  it("still offers to record when nothing is being saved", () => {
    // The guard above must not swallow the ordinary arrival.
    renderPage();

    expect(screen.getByRole("button", { name: /Start recording/ })).toBeInTheDocument();
  });

  it("offers to record even while an earlier meeting is still processing", () => {
    // Nothing stops you recording the next one. Sitting blank behind somebody
    // else's progress bar would be the guard above overreaching.
    renderPage({ state: "idle" }, {}, aJob({ phase: "processing" }));

    expect(screen.getByRole("button", { name: /Start recording/ })).toBeInTheDocument();
  });

  it("carries no standing explanation before a recording", () => {
    renderPage();

    // Both paragraphs were removed on request: what the microphone can hear,
    // and where the live preview goes. Asserted rather than merely deleted,
    // because the second was a disclosure — Chrome sends that preview audio to
    // Google — and putting it back is the sort of change that should be a
    // decision rather than a reflex.
    expect(screen.queryByText(/audio goes to Google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pick up in the room/i)).not.toBeInTheDocument();
  });

  it("no longer warns about a browser requirement it does not have", () => {
    renderPage();

    // Tab capture was the only part that needed Chrome or Edge. Plain
    // getUserMedia works everywhere, so this warning would now be telling
    // somebody their working setup is broken.
    expect(screen.queryByText(/needs Chrome or Edge/i)).not.toBeInTheDocument();
  });

  it("sends a browser that cannot record somewhere it can", () => {
    renderPage({ supported: false });

    expect(screen.getByText(/can't record audio/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a file instead/ })).toBeInTheDocument();
    // And does not ask it for a microphone it has already said it has not got.
    expect(start).not.toHaveBeenCalled();
  });

  it("offers a way back when the microphone is refused", async () => {
    renderPage({ error: "Microphone access was denied. Reverie needs it to record you." });

    // The recording never began, so without this the route is a dead end with a
    // red banner on it, and the browser will not prompt again unasked.
    expect(screen.getByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow the microphone in your browser/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Start recording/ }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it("does not ask again by itself once it has been refused", async () => {
    // A denial puts the recorder back to idle with an error. Nothing on this
    // route asks by itself any more, so there is nothing to re-prompt -- and
    // the assertion stays, because an effect that reopened on idle is exactly
    // what restoring the old arrival would reintroduce.
    const view = renderPage();

    recorder.current = {
      ...(recorder.current as UseRecorder),
      error: "Microphone access was denied.",
    };
    view.rerender(<RecordPage />);

    expect(start).not.toHaveBeenCalled();
  });

  it("carries no heading, name field or date before a recording", () => {
    renderPage();

    // All removed on request. Recordings are saved under the date now and
    // renamed on the meeting page, where the meeting has actually happened and
    // somebody knows what to call it.
    expect(screen.queryByLabelText("Name this recording")).not.toBeInTheDocument();
    expect(screen.queryByText("Not started")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Upload a recording instead/ }),
    ).not.toBeInTheDocument();
  });

});

describe("RecordPage note heading", () => {
  const startedAt = new Date("2026-08-19T06:05:00");

  it("names the note, dates it and says whose it is", () => {
    renderPage({ state: "recording", startedAt });

    expect(screen.getByLabelText("Name this note")).toBeInTheDocument();
    expect(screen.getByText(/Aug 19, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Owner: Sam Okafor/)).toBeInTheDocument();
  });

  it("offers the name as a placeholder, not as content", () => {
    renderPage({ state: "recording", startedAt });

    // A value would have to be cleared before anything could be typed — a name
    // nobody chose, defended by the delete key.
    const field = screen.getByLabelText("Name this note");
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "Note");
  });

  it("keeps what was typed, since the session outlives this page", () => {
    renderPage({ state: "recording", startedAt }, { title: "Tuesday design review" });

    expect(screen.getByLabelText("Name this note")).toHaveValue("Tuesday design review");
  });

  it("takes a name without demanding one", async () => {
    renderPage({ state: "recording", startedAt });

    await userEvent.type(screen.getByLabelText("Name this note"), "S");

    expect(setTitle).toHaveBeenCalled();
  });

  it("dates the note from when recording began, not from the clock", () => {
    renderPage({ state: "recording", startedAt, elapsed: 90 });

    // Read from the clock it would tick over while the meeting ran, and the
    // heading would disagree with the recording underneath it.
    expect(screen.getByText(/6:05/)).toBeInTheDocument();
  });

  it("says nothing about a note that does not exist yet", () => {
    renderPage({ state: "idle" });

    // Before Start there is no note. A name field over an empty page asks
    // somebody to title a meeting that has not happened.
    expect(screen.queryByLabelText("Name this note")).not.toBeInTheDocument();
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });
});

describe("RecordPage processing", () => {
  it("does not draw the pipeline, which happens after this page is left", () => {
    // Saving navigates to the meeting and the wait is drawn there, so by the
    // time there is anything to watch this page is behind you.
    renderPage(
      { state: "idle" },
      {},
      aJob({
        phase: "processing",
        job: { id: "mtg_9", status: "TRANSCRIBING", progress: 40, message: "Transcribing…" },
      }),
    );

    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop processing/ })).not.toBeInTheDocument();
  });
});

describe("RecordPage live text", () => {
  it("shows the words with the speaker and the time they were said", () => {
    renderPage(
      { state: "recording" },
      {
        transcript: aTranscript({
          turns: [
            aTurn({ id: "1:1", at: 4, speaker: "Speaker 1", text: "Hello, hello, hello." }),
            aTurn({ id: "1:2", at: 20, speaker: "Speaker 2", text: "Shall we start?" }),
          ],
        }),
      },
    );

    expect(screen.getByText("Hello, hello, hello.")).toBeInTheDocument();
    expect(screen.getByText("Shall we start?")).toBeInTheDocument();
    // Who said it, which the browser-speech preview could not answer at all.
    // Matched on the name alone: the separator is its own element now, so it
    // is decoration between two facts rather than part of either.
    expect(screen.getByText("Speaker 1")).toBeInTheDocument();
    expect(screen.getByText("Speaker 2")).toBeInTheDocument();
    // The provider's own timeline, and the one the finished transcript uses.
    expect(screen.getByText(/0:04/)).toBeInTheDocument();
    expect(screen.getByText(/0:20/)).toBeInTheDocument();
  });

  it("says it is working out who is speaking rather than guessing", () => {
    // Filing an unattributed turn under Speaker 1 puts a quotation beside
    // somebody who may never have said it, and during a live meeting that name
    // is read and acted on.
    renderPage(
      { state: "recording" },
      {
        transcript: aTranscript({
          turns: [aTurn({ speaker: "Unknown speaker", speakerStatus: "unknown", text: "mm hm" })],
        }),
      },
    );

    expect(screen.getByText(/Identifying speaker/)).toBeInTheDocument();
    expect(screen.queryByText(/Speaker 1/)).not.toBeInTheDocument();
  });

  it("shows the turn still being spoken", () => {
    renderPage(
      { state: "recording" },
      {
        transcript: aTranscript({
          pending: aTurn({ id: "1:9", text: "so the next thing", final: false }),
        }),
      },
    );

    expect(screen.getByText("so the next thing")).toBeInTheDocument();
  });

  it("no longer calls the live text the browser's own speech service", () => {
    renderPage(
      { state: "recording" },
      { transcript: aTranscript({ turns: [aTurn()] }) },
    );

    // It was true and is not any more. The words come from the same provider
    // that writes the final transcript, over a websocket, with diarization --
    // calling them the browser's would now be the misleading claim.
    expect(screen.queryByText(/rough preview from your browser/i)).not.toBeInTheDocument();
  });

  it("shows nothing until somebody says something", () => {
    renderPage({ state: "recording" });

    // Not an empty state, an empty page. The timer, the waveform and the red
    // Stop button in the bar are already saying that this is recording.
    expect(screen.queryByText(/live text/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
  });

  it("shows nothing extra in a browser that cannot do it either", () => {
    renderPage({ state: "recording" }, { transcript: aTranscript({ supported: false }) });

    expect(screen.queryByText(/speech recognition/i)).not.toBeInTheDocument();
  });

  it("still reports a live-text failure, without dressing it as a status", () => {
    renderPage(
      { state: "recording" },
      { transcript: aTranscript({ error: "Live text stopped." }) },
    );

    // Worth saying, because the words stop arriving and the reason is not
    // otherwise visible. Not worth a panel: the recording is unaffected.
    expect(screen.getByText("Live text stopped.")).toBeInTheDocument();
  });

  it("keeps the words up after Stop, while there is a decision to make", () => {
    renderPage(
      {
        state: "stopped",
        result: { file: new File(["x"], "r.webm", { type: "audio/webm" }), durationSeconds: 90 },
      },
      {
        transcript: aTranscript({ turns: [aTurn({ at: 5, text: "Hello." })] }),
      },
    );

    // Clearing the pane at the moment somebody chooses between Save and Discard
    // takes away the thing that choice is about.
    expect(screen.getByText("Hello.")).toBeInTheDocument();
  });

  it("does not claim to be transcribing a paused meeting", () => {
    renderPage(
      { state: "paused" },
      {
        transcript: aTranscript({ turns: [aTurn({ at: 5, text: "Hello." })] }),
      },
    );

    expect(screen.getByText(/nothing is being recorded or transcribed/i)).toBeInTheDocument();
  });
});

describe("RecordPage while recording", () => {
  it("puts the setup away once the decisions are made", () => {
    renderPage({ state: "recording", elapsed: 9 });

    // Left on screen and disabled, these read as a form that failed rather than
    // one already filled in.
    expect(screen.queryByRole("button", { name: /Online meeting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start recording/ })).not.toBeInTheDocument();
  });

  it("says nothing at all until the meeting does", () => {
    renderPage({ state: "recording" });

    // There was a panel here restating what the control bar already shows — a
    // running timer, a moving waveform, a red Stop. It occupied the space the
    // words are about to appear in, to say that words were not appearing.
    expect(screen.queryByText(/^Recording$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Listening/i)).not.toBeInTheDocument();
  });

  it("does not call microphone-only a problem, now that it is the design", () => {
    renderPage({ state: "recording" });

    // This warning existed because a mode that was supposed to capture other
    // participants sometimes did not. With nothing else to capture it would be
    // reporting the product as a fault.
    expect(screen.queryByText(/Microphone only/)).not.toBeInTheDocument();
  });

  it("explains what the browser is waiting for", () => {
    renderPage({ state: "requesting" });

    expect(screen.getByText(/Waiting for permission/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow the microphone/i)).toBeInTheDocument();
  });

  it("surfaces a recorder failure rather than sitting there", () => {
    renderPage({ state: "recording", error: "Couldn't switch microphone." });

    expect(screen.getByText("Couldn't switch microphone.")).toBeInTheDocument();
  });
});

describe("RecordPage after stopping", () => {
  it("says the audio is still only in this tab", () => {
    renderPage({
      state: "stopped",
      result: {
        file: new File(["x"], "recording-1.webm", { type: "audio/webm" }),
        durationSeconds: 90,
      },
    });

    // The single easiest thing in the app to lose: captured, not yet uploaded,
    // and gone if the tab closes.
    expect(screen.getByText(/closing the tab now would lose the audio/i)).toBeInTheDocument();
  });

  it("does not offer to start another one over the top", () => {
    renderPage({
      state: "stopped",
      result: {
        file: new File(["x"], "recording-1.webm", { type: "audio/webm" }),
        durationSeconds: 90,
      },
    });

    expect(screen.queryByRole("button", { name: /^Start recording/ })).not.toBeInTheDocument();
  });
});

/**
 * The allowance, at the point it stops being theoretical.
 *
 * <p>There is no reset date and nothing to buy, so "you are out of minutes" is
 * permanent. Two failures matter and neither would raise anything:
 *
 * <ul>
 *   <li>opening the microphone for somebody who cannot record — a permission
 *       prompt spent on a refusal;</li>
 *   <li>letting a recording run past the balance, which the server then refuses
 *       at save time, destroying audio somebody sat through.</li>
 * </ul>
 */
describe("what is left of the allowance", () => {
  it("does not open the microphone with no minutes left", async () => {
    usage = { ...usage, minutesUsed: 100 };

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/There is nothing left to record with/)).toBeInTheDocument(),
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("says what is gone and what is not", async () => {
    usage = { ...usage, minutesUsed: 100 };

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/already transcribed is still here/)).toBeInTheDocument(),
    );
  });

  it("opens the microphone normally while a minute remains", async () => {
    usage = { ...usage, minutesUsed: 99 };

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Start recording/ }));

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(screen.queryByText(/nothing left to record with/)).not.toBeInTheDocument();
  });

  it("refuses to start at all once the allowance is gone", async () => {
    /*
     * The check moved with the button. It used to run in the mount effect, and
     * the one path to `recorder.start()` is now this press, so the refusal has
     * to hold here or it holds nowhere.
     */
    usage = { ...usage, minutesUsed: 100 };

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/There is nothing left to record with/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /Start recording/ }));

    expect(start).not.toHaveBeenCalled();
  });

  it("stops the recording when it reaches the balance", async () => {
    usage = { ...usage, minutesUsed: 95 };
    const stop = vi.fn();

    // Five minutes left is 300 seconds, and `elapsed` is the whole-second
    // counter that becomes the saved duration. At 300 it is spent.
    renderPage({ state: "recording", elapsed: 300, stop });

    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("leaves a recording alone one second short of it", async () => {
    usage = { ...usage, minutesUsed: 95 };
    const stop = vi.fn();

    // 299 rounds to five minutes and fits. Stopping here would cut a meeting
    // short to defend a limit it had not reached.
    renderPage({ state: "recording", elapsed: 299, stop });

    await waitFor(() => expect(start).not.toHaveBeenCalled());
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not stop a recording that is already stopped", async () => {
    usage = { ...usage, minutesUsed: 100 };
    const stop = vi.fn();

    renderPage({ state: "stopped", elapsed: 9000, stop });

    await waitFor(() => expect(start).not.toHaveBeenCalled());
    expect(stop).not.toHaveBeenCalled();
  });
});

/**
 * The responsibility line, and the words behind it.
 *
 * <p>The page deliberately carries no standing explanation — see "carries no
 * standing explanation before a recording" above, which holds the two
 * paragraphs that were removed. This is the exception, added on request, and
 * these cases are about the shape of it rather than the sentence: it must not
 * gate, must not need dismissing, and must not be in the way of the microphone.
 */
describe("RecordPage responsibility notice", () => {
  it("says to tell the room before anything is captured", () => {
    renderPage();

    expect(
      screen.getByText(/Make sure everyone who needs to know has been informed/i),
    ).toBeInTheDocument();
    // Not the consent gate that was removed: nothing to tick and nothing to
    // confirm. One button, which records.
    expect(document.querySelector("input[type=checkbox]")).toBeNull();
    expect(screen.queryByRole("button", { name: /I have|confirm|agree/i })).not.toBeInTheDocument();
  });

  it("shows the words to say out loud before recording, not behind a disclosure", () => {
    /*
     * Folded away, it is one keystroke from a footnote beside a running
     * meeting, which is the right trade there. It is the wrong trade on the one
     * screen whose whole job is to be read before anything is captured -- the
     * sentence somebody needs is the sentence they have not thought of yet.
     */
    renderPage();

    expect(screen.getByText(new RegExp(RECORDING_ANNOUNCEMENT.slice(0, 40), "i")))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What can I say?" })).not.toBeInTheDocument();
  });

  it("says what it cannot know, rather than letting the button imply it", () => {
    /*
     * Pressing Start says the person at the keyboard chose to record. It does
     * not say the others agreed, and Reverie has no way to find out: no bot in
     * the meeting, no participant list. A page that stayed quiet about that
     * would be leaving the button to suggest otherwise.
     */
    renderPage();
    const text = document.body.textContent ?? "";

    expect(text).toMatch(/Reverie cannot check it for you/i);
    // The principle that requirements vary, without naming a jurisdiction or
    // stating a rule -- which would be legal advice this page cannot give.
    expect(text).toMatch(/varies with where you all are/i);
    expect(text).not.toMatch(/one-party|two-party|GDPR|state law|jurisdiction/i);
  });

  it("does not let anything else open the microphone first", async () => {
    // The gap, stated as a test: the disclosure is on screen and the recorder
    // is untouched until the button under it is pressed.
    renderPage();

    expect(
      screen.getByText(/Make sure everyone who needs to know has been informed/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Start recording/ })).toBeInTheDocument(),
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("does not call the browser's permission prompt consent", () => {
    renderPage();

    // The prompt is a decision by the person at the keyboard. Everybody else in
    // the conversation is unrepresented in it, which is the whole reason there
    // is a sentence to read out.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/permission (is|means|counts as) consent/i);
    expect(text).not.toMatch(/everyone has consented|consent (has been )?given/i);
  });

  it("keeps the announcement folded away once recording is under way", async () => {
    // The footnote's job, and the state it belongs to. Standing open beside a
    // running meeting it is a paragraph of somebody else's words on a page
    // whose whole redesign was about having no standing paragraphs.
    renderPage({ state: "recording" });

    const toggle = screen.getByRole("button", { name: "What can I say?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Rendered but hidden, so `aria-controls` points at something real and the
    // three sentences are out of the accessibility tree until wanted.
    const region = document.getElementById("recording-announcement")!;
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("hidden");
    expect(toggle).toHaveAttribute("aria-controls", "recording-announcement");
  });

  it("reveals the sentence from lib/privacy, not a second copy of it", async () => {
    renderPage({ state: "recording" });

    await userEvent.click(screen.getByRole("button", { name: "What can I say?" }));

    const toggle = screen.getByRole("button", { name: "What can I say?" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById("recording-announcement")!;
    expect(region).not.toHaveAttribute("hidden");
    // The constant itself. It is tested in lib/privacy.test.ts and it is the
    // one string here meant to be read aloud to other people; two copies of
    // that is how one of them comes to be wrong.
    expect(region.textContent).toContain(RECORDING_ANNOUNCEMENT);

    // And it folds away again, because it is a disclosure rather than a step.
    await userEvent.click(toggle);
    expect(document.getElementById("recording-announcement")).toHaveAttribute("hidden");
  });

  it("stays out of the way of a recording in progress", () => {
    renderPage({ state: "recording" });

    // Still there — somebody may not have said it yet — and still last on the
    // page, under the words rather than over them.
    const notice = screen.getByText(/Make sure everyone who needs to know has been informed/i);
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What can I say?" })).toBeInTheDocument();
  });
});
