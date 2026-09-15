/** @type {import('next').NextConfig} */

/**
 * Where Clerk's bot protection lives.
 *
 * Smart CAPTCHA is Cloudflare Turnstile behind Clerk's own domain, so it needs
 * two origins and it needs them in two directives: the widget is a *script*
 * that draws its challenge in an *iframe*, and a policy that allows one without
 * the other fails in a way that looks like the challenge simply never appeared.
 *
 * This is the other half of the mount element. With `#clerk-captcha` on the page
 * and these origins missing, Clerk has somewhere to put the challenge and no
 * way to fetch it — which is why email/password sign-up kept reporting "We
 * could not confirm you are not a robot." after the element was added.
 */
const CLERK_BOT_PROTECTION = "https://challenges.cloudflare.com https://*.protect.clerk.com";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.reverieai.in ${CLERK_BOT_PROTECTION}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  `frame-src 'self' https://*.clerk.accounts.dev https://accounts.google.com ${CLERK_BOT_PROTECTION}`,
  /*
   * `https://*.protect.clerk.com:*`, and the port wildcard is the whole reason
   * this entry exists separately from the two above.
   *
   * `https://*.clerk.com` is already here and CSP host wildcards do span
   * multiple labels, so it already matches `*.protect.clerk.com` -- on port 443
   * and nowhere else. A host-source with no port means the scheme's default
   * port, and Clerk's abuse and fraud protection can answer on others. Without
   * `:*` those calls are blocked by a policy that looks like it permits them.
   */
  "connect-src 'self' https://api.reverieai.in wss://api.reverieai.in https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://clerk.reverieai.in https://*.protect.clerk.com:* https://e683004bc0b99c6f00b901a43898799e.r2.cloudflarestorage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io wss://streaming.assemblyai.com",
].join("; ");

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  /**
   * Stop announcing what this is built with.
   *
   * Next sets `X-Powered-By: Next.js` on every response by default. It tells an
   * attacker which framework's advisories to go and read, and it does nothing
   * for anybody else.
   */
  poweredByHeader: false,
  /**
   * Folders used to live at /projects.
   *
   * The app calls them folders everywhere a person can read, and the URL was
   * the last place still saying project — so /projects/prj_1 is now
   * /folder/prj_1 and the list is /folders. These keep every link that was made
   * before that working: a bookmark, a tab left open since yesterday, a path
   * pasted into a chat.
   *
   * `permanent: false` on purpose. A 308 is cached by the browser more or less
   * forever, and a wrong one is remembered long after the config is fixed.
   * There is nothing depending on the SEO value of a permanent redirect here —
   * this is an app behind a login — so the recoverable one is the right trade.
   *
   * The API is untouched: /api/v1/projects is still the resource, and nothing
   * below rewrites it, because these run on the frontend's own routes only.
   */
  /**
   * Security headers.
   *
   * The app was serving none. The backend has Spring Security's defaults --
   * nosniff, X-Frame-Options: DENY -- but every one of these responses is a
   * page in somebody's browser, and the browser only enforces what it is told.
   *
   * The full Content-Security-Policy below was exercised in report-only mode
   * against production before enforcement, including Clerk authentication,
   * API traffic, Sentry, navigation, and live transcription.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            /*
             * Tell the browser never to come back over http. Render already
             * redirects, but a redirect is one round trip on a network where
             * somebody may be listening; HSTS removes the trip entirely.
             *
             * No `preload`. That submits the domain to a list baked into every
             * browser, and getting off it takes months -- a commitment worth
             * making deliberately, not as a side effect of a config edit.
             */
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // Stop the browser second-guessing a Content-Type. Matters most on
            // anything user-supplied that gets served back.
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Clickjacking. Nothing here is meant to be embedded, and an app
            // that can be framed can be framed invisibly over a decoy.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            /*
            * Full Content Security Policy.
            *
            * The policy was first exercised in report-only mode against production
            * auth, API calls, Sentry, navigation and live transcription. The observed
            * production Clerk frontend API origin is included before enforcement.
            */
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            // Send the origin to other sites, never the path. Meeting URLs
            // carry ids, and a full Referer hands them to whatever a user
            // clicks through to.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            /*
             * Microphone is `self` because recording is the product. Everything
             * else is denied outright -- this app has no reason to reach a
             * camera or a location, and saying so means an injected script
             * cannot either.
             */
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), interest-cohort=(), microphone=(self)",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: "/projects", destination: "/folders", permanent: false },
      { source: "/projects/:id", destination: "/folder/:id", permanent: false },
    ];
  },
};

module.exports = nextConfig;
