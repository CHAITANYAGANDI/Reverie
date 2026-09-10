"use client";

import * as React from "react";
import { highlight } from "@/lib/search";

/**
 * The search term, marked inside a result.
 *
 * <p>The escaping that makes this safe on arbitrary input lives in
 * `highlight()` — searching for "(draft)" or "c++" would otherwise throw inside
 * a render, on the one screen whose entire job is accepting typed text. No
 * `dangerouslySetInnerHTML` anywhere near it: the parts come back as data and
 * are rendered as elements.
 *
 * <h2>The tint</h2>
 *
 * <p>`--brand` at 20%, not `--primary`. `--primary` is `--ink` in this palette
 * — near-white — so a mark drawn with it was a light grey block behind the word,
 * which at five passages a panel read as redaction rather than as a match. The
 * accent's own rule covers this: azure means "Reverie noticed this", and the
 * marked run is the part it noticed.
 *
 * <p>Twenty percent and no border. The whole passage is one line of type at
 * 12.5px; anything stronger and the highlight is what gets read instead of the
 * sentence.
 */
export function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-brand/20 px-0.5 text-ink">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}
