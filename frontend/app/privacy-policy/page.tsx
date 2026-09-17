import Link from "next/link";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { Lockup } from "@/components/v2/lockup";
import { RECORDING_ANNOUNCEMENT } from "@/lib/privacy";

/**
 * PRIVACY & DEMO NOTICE — what the running software does with what you give it.
 *
 * <h2>Why it is not called a Privacy Policy</h2>
 *
 * <p>Because it is not one. A privacy policy is a document an organisation
 * writes and is bound by; this is a disclosure by a portfolio project, and
 * dressing it as the former would be the first false claim on a page whose
 * whole point is not making any. `lib/build-info` still supports a real hosted
 * policy through `NEXT_PUBLIC_PRIVACY_URL` for a deployment that has one.
 *
 * <p>There is deliberately no Terms of Service, no acceptance checkbox, no
 * cookie banner and no compliance appendix. Reverie asks nobody to agree to
 * anything, so a page saying otherwise would be inventing a relationship.
 *
 * <h2>Where the route lives, and why it is not under (app)</h2>
 *
 * <p>`app/privacy-policy` rather than `app/(app)/privacy-policy`: the `(app)`
 * group is wrapped in `AuthGate` and `AppShell`, so a page inside it needs a
 * session and draws the band, the tabs and the recording dock. This is read by
 * somebody deciding whether to sign up. `middleware.ts` names the path public —
 * without that entry the gate redirects to the sign-in form and the link is
 * worthless.
 *
 * <p>It is emphatically <b>not</b> `/privacy`, which is Account Settings → Data
 * Retention and must keep behaving that way: notification rows written months
 * ago carry that path in their link column. See `LEGACY_PATHS` in
 * lib/settings-tabs.
 *
 * <h2>Every claim here was read off the implementation</h2>
 *
 * <p>The sources, so the next person to edit this can check them rather than
 * trusting the prose:
 *
 * <ul>
 *   <li><b>What is stored</b> — `UserEntity` (profile and preference columns),
 *       `PrivacyOverviewResponse.Held` (the counted nouns: meetings,
 *       recordings, transcripts, action items, marks, projects, chats),
 *       `ChatConversation`/`ChatMessage`, and `V2__rag_chat.sql` for the
 *       passages and embeddings.</li>
 *   <li><b>Where audio goes</b> — `ai-service/app/providers/factory.py` picks
 *       the adapter; `assemblyai_adapter.py` either hands the provider a link
 *       to the object or uploads the bytes. Live text is
 *       `lib/use-live-transcript.ts`, which opens
 *       `wss://streaming.assemblyai.com/v3/ws` from the browser on a short
 *       token minted by `StreamingTokenController`.</li>
 *   <li><b>The language model</b> — `AiProvider` in `ai-service/app/config.py`
 *       is `"mock" | "openai"`, so OpenAI's API is the only one implemented.
 *       With no keys the pipeline runs the mock adapters and nothing
 *       leaves.</li>
 *   <li><b>Training</b> — there is no training, fine-tuning or evaluation code
 *       anywhere in the repository, and `PrivacyController` records why there is
 *       no administrator view: one account per workspace.</li>
 *   <li><b>Retention</b> — `RETENTION_CHOICES` (Never, a week, a month),
 *       `RetentionService` (two dials, age from creation), `RetentionJob`
 *       (03:00 UTC nightly).</li>
 *   <li><b>Deletion</b> — `ErasureService`: storage object first, then the
 *       rows, nothing flagged hidden; `eraseAccount` for the whole account, and
 *       `general-tab`'s close flow for the sign-in itself, which the auth
 *       provider's own settings can refuse.</li>
 *   <li><b>Email</b> — `Mailer` posts to `api.resend.com` when mail is
 *       configured.</li>
 * </ul>
 *
 * <p>Two things were left out for want of support in the code, and they are
 * worth naming so nobody adds them back on instinct. Nothing here claims that
 * deleting a meeting reaches a provider's copy — no code calls a provider to
 * delete anything. And nothing claims chat history is deleted on a schedule:
 * `chat_history_days` is stored on the user row, but no scheduled pass reads
 * it, so the honest sentence is the one below about conversations staying until
 * they are deleted.
 *
 * <h2>The composition</h2>
 *
 * <p>The landing page's own frame — near-black canvas, one ambient wash, a 68px
 * bar carrying the lockup and nothing else — over a single reading column at
 * `--measure`. Hairlines between the sections and no cards, because a document
 * is a document; a legal site's boxed clauses are how a short honest page comes
 * to look like a long evasive one.
 *
 * <p>Sans, not `.v2-read`. The serif is reserved for a transcript, a summary or
 * an answer — the root layout calls that border absolute — and this is none of
 * the three. 17px is the landing hero's body size, which is the largest sans
 * this system sets prose at and the right one for something read at length.
 *
 * <p>The mark is the product lockup, `Lockup`, exactly as the nav and the auth
 * shell draw it. Not a bare orb: this page is not an invocation of the
 * assistant, and the mark's own note in `components/v2/reverie-ai-mark` is
 * explicit about that distinction.
 */

export const metadata = {
  title: "Privacy & Demo Notice — Reverie",
  description:
    "What Reverie processes, where it is sent, how long it is kept, and how to delete it. Reverie is a portfolio project, not a commercial service.",
};

/** The document's own measure. 17px sans at 680px is about 80 characters. */
const PROSE = "text-[1.0625rem] leading-[1.62] text-ink-2";

export default function PrivacyNoticePage() {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Shorter than the landing's 60vmax: there is no hero here, so the wash
          lifts the title and is gone by the time the reading begins. Same
          declaration, same colours — see components/v2/ambient-canvas. */}
      <AmbientCanvas height="34rem" />

      <div className="relative">
        {/* `--measure`, not `--doc`. The landing bar is `--doc` wide because
            the page under it is; this page is a 680px column, and a lockup
            sitting 220px to the left of the first word of the document reads as
            two pages stacked. Measured on screen, not reasoned about. */}
        <header className="mx-auto flex h-[68px] max-w-measure items-center px-6 lg:px-8">
          {/* The way back, and the only navigation on the page. `decorative`
              hides the mark from a screen reader so the link is announced
              "Reverie" once rather than twice — the wordmark beside it is the
              same word. */}
          <Link
            href="/"
            className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <Lockup size={21} decorative />
          </Link>
        </header>

        <main className="mx-auto max-w-measure px-6 pb-24 pt-[clamp(2.25rem,6vh,4rem)] lg:px-8">
          <p className="v2-label">Privacy</p>
          <h1 className="mt-2.5 text-title-l font-headline leading-[1.14] tracking-[-0.018em] text-ink">
            Privacy &amp; Demo Notice
          </h1>
          <p className={`mt-3.5 ${PROSE}`}>
            What Reverie does with what you give it, in plain language. This is a
            disclosure about a demonstration project — not a contract, and not a
            legal privacy policy.
          </p>

          <div className="mt-12 space-y-11">
            <Section heading="Portfolio status">
              <p className={PROSE}>
                Reverie is a software-engineering and generative-AI portfolio
                project, built for demonstration and technical evaluation. It is
                not a commercial service: nothing is sold, there is no
                subscription, and it comes with no availability, support or
                data-protection commitments. One account is one workspace —
                nothing is shared into it, and nobody else can be added to it.
              </p>
            </Section>

            <Section heading="What Reverie processes">
              <p className={PROSE}>
                Only what the product needs to turn a conversation into a
                record:
              </p>
              <ul className="mt-5">
                <Item label="Your account">
                  The email address on the sign-in you used, and whatever you
                  fill in on your profile: display name, pronouns, job role,
                  department, picture and default language. Your password belongs to whoever you
                  signed in with. Reverie never sees it.
                </Item>
                <Item label="Recordings and uploads">
                  Audio you record here, and any audio or video file you bring
                  in yourself.
                </Item>
                <Item label="Transcripts">
                  The words, who said them, and when. Reverie also keeps the
                  transcript in a form it can search, so that a question can be
                  answered from the right part of a meeting.
                </Item>
                <Item label="What is written from them">
                  The summary, action items, decisions and risks, translations,
                  and the highlights, bookmarks and notes you make yourself.
                </Item>
                <Item label="Ask Reverie">
                  Your questions, the answers, and the scope you asked them in,
                  kept as named conversations so you can reopen one.
                </Item>
                <Item label="How you have set things up">
                  Folder names, notification settings, how long you asked
                  Reverie to keep things, and a record of the privacy choices
                  made on the account.
                </Item>
              </ul>
              <p className={`mt-6 ${PROSE}`}>
                If you turn email notifications on, your address and the message
                are passed to an outside email service so that it can send them.
              </p>
            </Section>

            <Section heading="AI processing">
              <p className={PROSE}>
                Reverie does not do the listening or the writing itself. Some
                features use outside AI services, and three things are sent to
                them:
              </p>
              <ul className="mt-5">
                <Item label="The recording, to be written down">
                  Your recording goes to a speech-to-text service, which sends
                  back the words, their timings, and who said what.
                </Item>
                <Item label="Live audio, while you are still recording">
                  So that words can appear on screen as you speak, audio goes
                  from your browser to AssemblyAI while the meeting is running.
                  The full transcript is written from the recording afterwards
                  and replaces those words.
                </Item>
                <Item label="The transcript, for everything written from it">
                  The text goes to OpenAI to write the summary, pick out action
                  items, decisions and risks, translate, and answer your
                  questions.
                </Item>
              </ul>
              <p className={`mt-6 ${PROSE}`}>
                These outside services handle what they are sent according to
                their own privacy rules. Reverie cannot make promises on their
                behalf. If this demo is running without those services connected,
                it uses built-in stand-in results instead and none of this is
                sent anywhere.
              </p>
            </Section>

            <Section heading="Model training">
              <p className={PROSE}>
                <strong className="font-headline text-ink">
                  Reverie does not train on your meetings.
                </strong>{" "}
                Reverie does not use your recordings, transcripts or notes to
                train its AI. They are used to produce your own summary, action
                items and answers, and for nothing else. Nobody here reads them,
                and they are not mixed in with anyone else&apos;s. The outside
                services named above set their own rules for what they do with
                what they receive.
              </p>
            </Section>

            <Section heading="Recording responsibly">
              <p className={PROSE}>
                Only record or upload conversations you are authorised to record
                and process. What is required before recording — who must be
                told, who must agree, and in what form — varies by location and
                by circumstance, and Reverie neither checks nor can judge it for
                you.
              </p>
              <p className={`mt-4 ${PROSE}`}>
                Nothing joins your call to announce itself: recording happens in
                your own browser, so the announcement has to come from you. The
                browser&apos;s microphone permission is a decision by the person
                at the keyboard — it is not consent from anybody else in the
                room. The record page offers a sentence you can read out:
              </p>
              {/* The same constant the record page reveals — lib/privacy. Two
                  copies of a sentence people are meant to read aloud is how one
                  of them ends up out of date. */}
              <p className="v2-note mt-5 text-[1.0625rem] leading-[1.62] text-ink-3" data-tone="quiet">
                “{RECORDING_ANNOUNCEMENT}”
              </p>
            </Section>

            <Section heading="Retention and deletion">
              <p className={PROSE}>
                Nothing is deleted on a schedule until you choose a window.
                Account Settings offers two — one for the recording, one for the
                whole meeting — and both start at Never, which means kept until
                you delete them. Once a day Reverie removes anything past the
                window you chose, counted from when the meeting was made rather
                than from when you last opened it, and tells you what went.
              </p>
              <p className={`mt-4 ${PROSE}`}>
                You can also delete a recording, a transcript or a whole meeting
                yourself, at any time. Deleting really deletes: the file and the
                record of it are removed rather than hidden, and it cannot be
                undone. Ask Reverie
                conversations stay until you delete them — they are not covered
                by the retention windows, though a conversation about one
                meeting goes when that meeting does.
              </p>
              <p className={`mt-4 ${PROSE}`}>
                Closing the account erases your meetings and their audio, and
                then asks whoever you signed in with to delete the sign-in
                itself; if that is refused, you are told so rather than told it
                worked. Deleting something here does not reach the outside AI
                services — Reverie does not ask them to delete anything, and how
                long they keep what they were sent is up to them.
              </p>
              {/*
                DISASTER-RECOVERY BACKUPS, WHICH THE PAGE USED NOT TO MENTION.

                <p>The database is backed up now -- on the Oracle host and to a
                Cloudflare R2 bucket -- so a backup taken before a deletion
                holds rows that the live database no longer has. Both are set
                to expire after seven days: the R2 bucket carries an enabled
                lifecycle rule on the `postgres-backups/` prefix, and the local
                copies are pruned on the same schedule.

                <p>This is the reason the paragraph below no longer says the
                entitlement record is the only thing that outlives an account.
                It is the only thing KEPT ON PURPOSE, which is a different
                claim and the one worth making: a backup is a copy waiting to
                age out, and an entitlement row is a decision.
              */}
              <p className={`mt-4 ${PROSE}`}>
                Reverie keeps backups so that everything can be restored if
                something goes badly wrong. A backup made before you deleted
                something still contains it. Nothing in Reverie can read those
                backups, and they are not used to answer questions or to bring
                anything back for you. Every backup is removed automatically
                after seven days, so some deleted information may remain in one
                for around a week after it has gone from Reverie itself.
              </p>
              {/*
                THE ONE THING KEPT ON PURPOSE, NAMED.

                <p>Reverie's free allowance — 100 transcribed minutes and 3
                imports — is described everywhere as being for the life of the
                account, and it was enforced by a counter that was deleted with
                the account. So closing one and signing up again with the same
                address handed out a fresh allowance, indefinitely.

                <p>The fix retains something after deletion, which means this
                page can no longer say everything goes. It says what is kept and
                what it cannot do, in that order, because the second half is
                what somebody closing their account actually wants to know.

                <p>Written from the schema rather than from intent: the row
                holds a keyed hash of the address, two integers and two
                timestamps. See `free_tier_entitlements` and
                `free_tier_identities` in V69.
              */}
              <p className={`mt-4 ${PROSE}`}>
                One small record is kept on purpose, and unlike a backup it does
                not expire. Reverie keeps a note of how much of your free
                allowance has already been used, so that closing an account and
                opening another does not reset it. It is scrambled in a way that
                cannot be reversed, so it holds no readable email address and no
                name. It contains none of your meetings, recordings,
                transcripts, notes or chats, it cannot bring any of them back,
                and the only thing that reads it is the check for how much of
                your free allowance is left.
              </p>
            </Section>

            <Section heading="AI limitations">
              <p className={PROSE}>
                Transcripts, summaries, action items and answers are produced by
                models and will sometimes be wrong: a misheard word, a sentence
                attributed to the wrong speaker, or a confident answer drawn
                from the wrong passage. Every answer cites the passages it came
                from and every action item links to the moment it was read out
                of, so anything that matters can be checked against the
                recording — and should be.
              </p>
            </Section>
          </div>

          {/* The last thing on the page, and a hairline rather than a tinted
              panel: it is the plainest sentence here, not an alarm. */}
          <p className="mt-14 border-t border-line pt-6 text-callout leading-[1.55] text-ink-3">
            Reverie is intended for demonstration and portfolio evaluation. Do
            not use the demo for confidential, legally privileged, highly
            sensitive, or production-critical information.
          </p>
        </main>
      </div>
    </div>
  );
}

/**
 * One section: a heading, and what it says.
 *
 * <p>`h2` under the page's one `h1`, in document order, so the notice can be
 * navigated by heading. No `id` and no table of contents — seven headings on
 * one screen-and-a-bit of reading is a page you scroll, and an index would be
 * furniture.
 */
function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={slug(heading)}>
      <h2
        id={slug(heading)}
        className="text-title-1 font-headline leading-[1.22] tracking-[-0.012em] text-ink"
      >
        {heading}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/**
 * One thing Reverie holds, or one thing that leaves.
 *
 * <p>A hairline row with a lead-in, which is the composition the landing page's
 * `Included` section already uses for a list of true statements. Not bullets: a
 * bulleted list of six clauses reads as a specification, and this is prose that
 * happens to be enumerable.
 */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="border-b border-line py-3.5 last:border-b-0">
      <p className="text-[0.9375rem] leading-[1.55] text-ink-3">
        <strong className="font-headline text-ink">{label}.</strong> {children}
      </p>
    </li>
  );
}

/** "AI processing" -> "ai-processing", for the heading relationship only. */
function slug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
