import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

// script-src and style-src both need 'unsafe-inline' — verified empirically
// against a real production build (`next build` + the standalone server),
// not assumed:
//   - Next.js 16's own app-router hydration emits several inline <script>
//     tags in the served HTML even with zero custom <script> usage anywhere
//     in this app's own source. Confirmed by diffing a clean build's CSP
//     violation reports; these are framework-owned, not something this
//     app's code controls.
//   - The React inline `style={{...}}` prop used by the annotation canvas,
//     chart pieces, and a few other components sets styles via the CSSOM,
//     which several browsers still gate under style-src.
// Next.js's own CSP docs (node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md) describe the alternative — a per-request
// nonce via proxy.ts — but that requires forcing every page into dynamic
// rendering (no static generation, no CDN caching) app-wide, which is a
// real architectural cost this internal, already-authenticated tool
// doesn't need to pay for the marginal gain over 'unsafe-inline'.
//
// script-src also needs 'unsafe-eval': one bundled dependency's compiled
// output uses the `Function("return this")()` idiom (a decades-old,
// static, input-independent trick for getting a cross-environment
// reference to the global object — grep the built chunks in
// .next/standalone/.next/static/chunks/ to confirm) rather than executing
// anything derived from user input.
//
// None of this eliminates default-src 'self''s real value: an XSS payload
// that DOES get injected still can't load a script/fetch data from any
// other origin, and frame-ancestors/object-src/form-action/base-uri below
// close off clickjacking, plugin-based, form-hijacking, and base-tag
// injection vectors regardless of the script-src/style-src compromise above.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // pdf.js (AttachmentPreviewModal, PdfPageCanvas) fetches the attachment
  // it renders via the same-origin /api/... signed URL — no third-party
  // connect target anywhere in this app.
  "connect-src 'self'",
  // pdf.js's worker (public/pdf.worker.min.mjs, copied in at build time —
  // see scripts/copy-pdf-worker.mjs) is loaded same-origin.
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Equivalent to X-Frame-Options: DENY, but understood by more browsers
  // and can express nuance X-Frame-Options can't — both are set below.
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Standalone output so the production Docker image only needs
  // .next/standalone + .next/static + public/ copied in, not the full
  // node_modules tree.
  output: "standalone",
  // Proxy the API through Next so the browser sees it as same-origin. That keeps
  // the httpOnly refresh cookie first-party — no CORS, no SameSite handling.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  // helmet() (apps/api/src/main.ts) only covers the NestJS API's own
  // responses — the HTML/JS this app itself serves had no security headers
  // at all before this.
  //
  // The CSP above was verified Report-Only first against a real production
  // build (`next build` + the standalone server, not `next dev` — dev mode's
  // Fast Refresh/HMR legitimately uses eval() and inline scripts that
  // production never ships, so testing against dev would have been
  // meaningless): login, password change, Register, clash detail, the
  // attachment preview + annotation canvas, and the dashboard all produced
  // zero violations, so it's enforcing here rather than Report-Only.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
        ],
      },
    ];
  },
};

export default nextConfig;
