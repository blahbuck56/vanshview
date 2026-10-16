import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { supabaseEnv } from "./lib/supabase/env";

// Content Security Policy: the browser may only load code from this site, talk to our Supabase
// project, and show the Cloudflare Turnstile check on the sign-in page. Errors go to Sentry
// through /monitoring on this site, so Sentry needs no entry. Next.js and React Flow add inline
// scripts and styles, hence 'unsafe-inline'; dev mode also needs 'unsafe-eval'.
function contentSecurityPolicy() {
  const supabase = new URL(supabaseEnv().url);
  const realtime = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  const dev = process.env.NODE_ENV !== "production";
  const turnstile = "https://challenges.cloudflare.com";
  const vercelToolbar = "https://vercel.live"; // comments toolbar on preview deployments
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${turnstile} ${vercelToolbar}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase.origin} ${realtime} ${vercelToolbar}`,
    `frame-src ${turnstile} ${vercelToolbar}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Sentry only reports when NEXT_PUBLIC_SENTRY_DSN is set (see instrumentation*.ts). Source maps
// are uploaded only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set too.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
  // Errors only: no performance tracing or replays, which keeps the download small.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
});
