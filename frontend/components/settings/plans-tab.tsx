"use client";

/**
 * Plans.
 *
 * One plan, free, and the page says so in the first sentence rather than
 * leaving somebody to scroll for the catch. What used to be here was three
 * cards — Free, Pro at $19, Premium at $49 — with a Stripe checkout behind two
 * of them and feature lists nothing in the codebase backed. Reverie does not
 * have two more products; it has one, and a pricing table that implies
 * otherwise is a promise made on behalf of work that does not exist.
 *
 * The usage figures are read from `/usage` rather than restated from the
 * feature list, because a limit somebody is near is the only number on this
 * page they need today.
 *
 * <h2>NO GREEN ANYWHERE ON THIS PAGE</h2>
 *
 * <p>The plan badge was `variant="success"` and every tick in the included list
 * was `text-success`. Neither was reporting a success. `--success` in this
 * palette is documented as "kept, resolved, done" — a processing stage that
 * finished, an action item ticked off — and spending it on "you are on the
 * free plan" and on eleven decorative ticks is how a semantic colour stops
 * meaning anything. Both are the accent now, which is the colour this product
 * uses for "this is in effect".
 */

import * as React from "react";
import { Check, Gauge } from "lucide-react";
import { useGetUsageQuery } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { INCLUDED, PLAN_NAME, usageFraction, usageLabel } from "@/lib/plan";

export function PlansTab() {
  return (
    <div className="space-y-10">
      <PlanCard />
      <UsageSection />
      <IncludedSection />
    </div>
  );
}

/**
 * The plan itself.
 *
 * No price toggle, no annual discount and no second card to compare against —
 * all three are furniture that only means something when there is a decision to
 * make. "Your current plan" stays, because it answers the question somebody
 * opened the tab with.
 */
function PlanCard() {
  return (
    <section aria-labelledby="plan-heading" className="space-y-3">
      <div>
        <h2 id="plan-heading" className="text-title-3 font-headline text-ink">
          Plans
        </h2>
        <p className="text-callout text-ink-3">
          Reverie has one plan. Everything the product does is in it.
        </p>
      </div>

      {/*
        The one grouped surface on this page, and it earns it: a plan IS one
        object, which is exactly what a radius and a fill are for. Everything
        else here is a section of a document and has neither.

        <p>`overflow-hidden` and the accent hairline along the top edge. The
        card was a flat bordered box holding a heading, a sentence, the word
        Free at display size and a badge, and it read as a form fieldset rather
        than as the one object on the page. A 2px rule the width of the card is
        the cheapest thing that says "this is the thing" without a gradient, a
        shadow or a second border.
      */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
        <div aria-hidden className="h-0.5 bg-gradient-to-r from-brand-fill via-brand to-brand-text" />

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-title-2 font-headline text-ink">{PLAN_NAME}</h3>
              <p className="mt-0.5 text-callout text-ink-3">
                For everyone. There is no other tier.
              </p>
            </div>
            {/* `brand`, not `success`. See the note at the top of this file. */}
            <Badge variant="brand">Your current plan</Badge>
          </div>

          {/*
            The price and what binds it, side by side.

            <p>`Free` was a display-size word floating above a badge with the
            two limits four lines below it in a paragraph. They are one fact —
            it costs nothing AND here is the ceiling — so they are one row, with
            the numbers as figures rather than as prose. Somebody who opens this
            tab is asking exactly these three questions.
          */}
          <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            <Figure term="Price" value="Free" detail="No card, no trial." />
            <Figure term="Minutes" value="100 min" detail="For the life of the account." />
            <Figure term="Imports" value="3 files" detail="Also for the life of it." />
          </dl>

          <p className="mt-4 text-foot text-ink-4">
            Nothing on this page is a trial and nothing expires. Both numbers are
            for the life of the account rather than per month, and both are shown
            below against what you have used.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * One of the three facts about the plan.
 *
 * <p>A `dl`, because that is what these are: a term and its value. The 1px gaps
 * come from the grid's own `bg-line` showing through `gap-px`, so there are no
 * borders to get wrong at the ends of a row that reflows to one column below
 * `sm`.
 */
function Figure({ term, value, detail }: { term: string; value: string; detail: string }) {
  return (
    <div className="bg-surface-raised px-4 py-3.5">
      <dt className="v2-label">{term}</dt>
      <dd className="mt-1 text-title-3 font-headline text-ink">{value}</dd>
      <dd className="mt-0.5 text-foot text-ink-4">{detail}</dd>
    </div>
  );
}

/**
 * What this account has spent of what it is allowed.
 *
 * Both figures are enforced now, so both get a bar: 100 transcribed minutes and
 * 3 imports, for the life of the account. It used to be one bar — five meetings
 * a calendar month — beside a minute count with no ceiling, because minutes
 * were tallied and checked against nothing.
 *
 * The meeting count is gone from here entirely. Nothing refuses a recording for
 * being the eleventh; what it costs is its minutes, and those are the bar above.
 */
function UsageSection() {
  const { data, isLoading } = useGetUsageQuery();

  return (
    <section aria-labelledby="usage-heading" className="space-y-3">
      <h2 id="usage-heading" className="flex items-center gap-2 text-title-3 font-headline text-ink">
        <Gauge className="h-4 w-4 text-ink-3" /> This account
      </h2>

      {/* A section, not a card. Two figures and two bars are a reading of the
          account, and boxing them turns a preferences document into a
          dashboard. */}
      {isLoading || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-5">
          <Meter
            label="Minutes transcribed"
            reading={usageLabel(data.minutesUsed, data.minutesLimit)}
            fraction={usageFraction(data.minutesUsed, data.minutesLimit)}
            note={
              <>
                Recording and importing both spend them, and this is the whole
                allowance — it is not monthly and there is no date it comes
                back. {data.meetingsUsed} meeting
                {data.meetingsUsed === 1 ? "" : "s"} so far, which nothing
                limits: what a recording costs is its length.
              </>
            }
          />
          <Meter
            label="Imports used"
            reading={usageLabel(data.importsUsed, data.importsLimit)}
            fraction={usageFraction(data.importsUsed, data.importsLimit)}
            ruled
            note="Files you upload. Recording in the browser is not one of these — it spends minutes only."
          />
        </div>
      )}
    </section>
  );
}

/**
 * One allowance, as a figure and a bar.
 *
 * <p>Both were written out by hand and had drifted: the first read its figure
 * in `--ink-4` at cap size and the second in `--muted-foreground` at body size,
 * and only one of them was `tabular`. Two numbers meant to be compared should
 * not be set in two ways.
 */
function Meter({
  label,
  reading,
  fraction,
  note,
  ruled,
}: {
  label: string;
  reading: string;
  fraction: number;
  note: React.ReactNode;
  /** A hairline above it, for the second and any later one. */
  ruled?: boolean;
}) {
  return (
    <div className={ruled ? "border-t border-line pt-5" : undefined}>
      <div className="mb-1.5 flex items-baseline justify-between gap-4 text-callout">
        <span className="text-ink-2">{label}</span>
        {/* `tabular` so the two readings' digits line up down the column. */}
        <span className="tabular font-mono text-cap text-ink-4">{reading}</span>
      </div>
      {/*
        The bar is the accent, not `--primary`.

        <p>`Progress` fills with `bg-primary`, and under the V2 palette
        `--primary` is INK — near-white — because an accent spent on every
        button is an accent that means nothing. That rule is about buttons. Two
        solid white bars are the loudest thing on this page, louder than the
        plan card above them, and what they are reporting is a reading of the
        account rather than an action: "this is in effect", which is exactly
        what the accent means here.

        <p>Targeted through the child rather than by adding an
        `indicatorClassName` to the shared component: the indicator is its only
        element child, and one page wanting a different fill is not a reason to
        widen an API four other callers read.
      */}
      <Progress value={fraction} aria-label={label} className="[&>div]:bg-brand" />
      <p className="mt-2 text-foot text-ink-4">{note}</p>
    </div>
  );
}

/** What you get, grouped the way somebody looks for it. */
function IncludedSection() {
  return (
    <section aria-labelledby="included-heading" className="space-y-4">
      <h2 id="included-heading" className="text-title-3 font-headline text-ink">
        What is included
      </h2>

      {/* Sub-sections of one document, not five cards. This is a list of what
          the product does; boxing each heading turns reading it into scanning
          a comparison table for a comparison that does not exist -- there is
          one plan. */}
      {INCLUDED.map((group) => (
        <div key={group.heading} className="border-b border-line pb-4 last:border-b-0">
          <h3 className="v2-label mb-2">{group.heading}</h3>
          <div className="space-y-2.5">
            {group.features.map((feature) => (
              <div key={feature.label} className="flex items-start gap-3 text-callout">
                {/* The accent, not `--success`. Eleven green ticks on a page
                    with nothing to succeed at is a semantic colour spent on
                    decoration -- see the note at the top of this file. */}
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-text" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-ink-2">{feature.label}</span>
                  {feature.detail && (
                    <span className="block text-foot text-ink-4">{feature.detail}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
