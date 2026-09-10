"use client";

/**
 * A HEADING, SOMETHING QUIET BESIDE IT, AND THE ROWS.
 *
 * <p>`K.group` from the V2 references: a `.v2-label` heading, anything else
 * pushed to the far end of the same baseline, and 24px under the whole thing.
 * No card, no rule under the heading, no background — the hairlines between the
 * rows are the only lines in the list.
 *
 * <p>What it replaces on these pages is a table header: "Name / Last Updated ▼"
 * over the folders and the single word "Conversation" over a folder's meetings.
 * A column header implies columns to sort and align, and there was one column.
 *
 * <p>The aside is where a count or a control goes. On the same baseline as the
 * label rather than on a row of its own, so a date filter or "3" reads as
 * belonging to the group it sits over instead of floating in the whitespace
 * above it.
 *
 * <p>Now has its own copy of this, deliberately left alone: that page was signed
 * off and the instruction with this work was not to touch it. If a third caller
 * appears, this is the one to keep.
 */

import * as React from "react";

export function Group({
  heading,
  note,
  aside,
  children,
}: {
  heading: string;
  /** A sentence about the group, where one is true. */
  note?: string;
  /** A count, or a control that narrows what is underneath. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 className="v2-label">{heading}</h2>
        {note && <p className="text-foot text-ink-4">{note}</p>}
        {aside && <div className="ml-auto shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The separator this product puts between metadata facts. */
export function Dot() {
  return (
    <span aria-hidden className="px-1.5 text-ink-5">
      ·
    </span>
  );
}

/**
 * A dotted row of facts, with the dots only between the ones that are there.
 *
 * <p>Built from a list rather than written inline, because a meeting with no
 * duration must not render "09:12 · · Processing" and every metadata line in
 * this product has at least one optional fact in it.
 */
export function Facts({ children }: { children: React.ReactNode }) {
  const facts = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {facts.map((fact, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Dot />}
          {fact}
        </React.Fragment>
      ))}
    </>
  );
}
