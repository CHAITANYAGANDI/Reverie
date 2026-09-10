/**
 * The documents that govern this deployment.
 *
 * <h2>Terms: still nobody's but a deployment's</h2>
 *
 * <p>Reverie ships no terms of service. Those are a document somebody has to
 * write and be bound by, not a string a UI can supply, and this is a portfolio
 * project that asks nobody to agree to anything. Set `NEXT_PUBLIC_TERMS_URL`
 * and the settings footer links to it; leave it unset — which is the default
 * and the expected state — and there is no Terms link anywhere in the product.
 *
 * <h2>Privacy: an internal page now, and why that is the default</h2>
 *
 * <p>The privacy link used to work the same way, and rendered nothing until
 * somebody supplied `NEXT_PUBLIC_PRIVACY_URL`. The reasoning was sound —
 * <i>a link to a page that does not exist is worse than no link</i> — and it
 * stopped being true the moment this repository started shipping
 * `app/privacy-policy`. A default pointing at a page that is in the bundle
 * cannot 404.
 *
 * <p>So the privacy link resolves internally unless a deployment overrides it.
 * The trade, stated because it is a real one:
 *
 * <ul>
 *   <li><b>What it buys.</b> Every environment — a local checkout with no `.env`
 *       at all, a preview build, the hosted demo — has a working privacy link
 *       with nothing configured. The alternative asks every developer to set a
 *       variable to the value of a route in their own repository, and the
 *       failure mode when they do not is silent: a page that exists, is
 *       reachable by typing the URL, and is linked from nowhere in the
 *       product.</li>
 *   <li><b>What it costs.</b> A deployment that wants <i>no</i> privacy link can
 *       no longer get there by leaving a variable unset; it would have to edit
 *       this file. That is the less surprising of the two defaults for
 *       software whose own privacy notice is part of the source tree.</li>
 * </ul>
 *
 * <p>An external URL still wins and is still labelled "Privacy Policy", because
 * a deployment that has a real hosted policy is describing a different kind of
 * document from the one in this repository. The internal default is labelled
 * for what it is: a Privacy &amp; Demo Notice.
 *
 * <h2>What left this file</h2>
 *
 * <p>`BUILD_VERSION`, `BUILD_COMMIT` and the `BUILD_LINE` they composed —
 * "Version 0.0.0 — dev build" at the foot of Account Settings. The idea was
 * that a bug report could be traced to a commit, and it only works in a build
 * that was given one: without `NEXT_PUBLIC_BUILD_SHA` the line traces to
 * nothing and reads as unfinished software to everybody except the person who
 * built it. Nothing else consumed them.
 *
 * <p>The build arguments are still wired up in docker-compose, so a version
 * line is a few lines away if it is ever wanted with a real commit behind it.
 */

import { PRIVACY_NOTICE } from "@/lib/routes";

export interface LegalLink {
  label: string;
  href: string;
  /**
   * The href is a route in this app rather than somewhere else on the web.
   *
   * <p>Read by whatever renders the link: an internal one is a `next/link` in
   * the same tab, and an external one opens in a new one with `rel="noreferrer"`.
   * Sending somebody out of the product to read its own page, or opening a
   * third party's policy over the settings screen they were using, are the two
   * mistakes this exists to prevent.
   */
  internal?: boolean;
}

/** What the page in this repository is called. It is not a privacy policy. */
export const PRIVACY_NOTICE_LABEL = "Privacy & Demo Notice";

const TERMS_URL = (process.env.NEXT_PUBLIC_TERMS_URL ?? "").trim();
const PRIVACY_URL = (process.env.NEXT_PUBLIC_PRIVACY_URL ?? "").trim();

export const LEGAL_LINKS: LegalLink[] = [
  ...(TERMS_URL ? [{ label: "Terms of Service", href: TERMS_URL }] : []),
  PRIVACY_URL
    ? { label: "Privacy Policy", href: PRIVACY_URL }
    : { label: PRIVACY_NOTICE_LABEL, href: PRIVACY_NOTICE, internal: true },
];
