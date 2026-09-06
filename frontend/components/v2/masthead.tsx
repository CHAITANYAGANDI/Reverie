"use client";

/**
 * THE HEAD OF A DOCUMENT PAGE.
 *
 * <p>`P.mast` from the V2 references, which every page in the study opens with:
 * where you are, what this is, a sentence of prose if there is one worth
 * writing, and then the controls. In that order, and with the controls last —
 * the shipped pages opened with an `h1` and a filter on the same flex row,
 * which puts a control at the same level as the name of the page and leaves
 * nowhere for the sentence to go.
 *
 * <p>Shared rather than written three times, because Library, the folders index
 * and a folder all open with one and the differences between them are the four
 * strings. See `design-demo/final/14-library.html`, `16-folders.html` and
 * `17-folder.html`.
 *
 * <h2>Why the eyebrow is not a breadcrumb trail</h2>
 *
 * <p>"Library · folders" is one line of quiet text, and the way back up is the
 * chevron above it. A row of links with separators is a navigation component;
 * this is a label that happens to say where it is, which is all the depth this
 * product has — two levels, and the second one always came from the first.
 *
 * <p>Nothing here is a surface. No card, no rule under the title, no filled
 * header band: the space and the type are the hierarchy, and the only line on
 * these pages is the hairline between rows.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export interface MastheadBack {
  href: string;
  /** What is up one level, named — "Library", "Folders". */
  label: string;
}

export function Masthead({
  back,
  label,
  title,
  sub,
  meta,
  bar,
}: {
  back?: MastheadBack;
  /** The eyebrow: "Library", "Library · folders". */
  label?: string;
  title: React.ReactNode;
  /** One sentence. Prose, not a subtitle restating the title. */
  sub?: React.ReactNode;
  /** Facts about the thing, in a dotted row. Only ones the server sent. */
  meta?: React.ReactNode;
  /** Controls. Last, so they read as acting on what is above them. */
  bar?: React.ReactNode;
}) {
  return (
    <header className="pt-10">
      {back && (
        <Link
          href={back.href}
          className="mb-3.5 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-foot text-ink-3 transition-colors duration-press ease-soft hover:text-ink-2"
        >
          <ChevronLeft className="h-[13px] w-[13px]" aria-hidden />
          {back.label}
        </Link>
      )}

      {label && <p className="v2-label mb-[9px]">{label}</p>}

      <h1 className="text-title-l font-headline text-ink">{title}</h1>

      {sub && (
        <p className="mt-2.5 max-w-[58ch] text-title-3 font-body leading-[1.5] text-ink-3">
          {sub}
        </p>
      )}

      {meta && (
        <div className="mt-3 flex flex-wrap items-center text-foot text-ink-3">{meta}</div>
      )}

      {/* 26px under the prose and 22px over the first group heading, which is
          the reference's rhythm: the bar belongs to the masthead rather than
          floating between it and the list. */}
      {bar && <div className="mt-[26px] flex flex-wrap items-center gap-2 pb-[22px]">{bar}</div>}
      {!bar && <div className="pb-5" />}
    </header>
  );
}
