// Shared Sentry settings for the browser, the server and middleware. Family trees are personal
// data, so no session replays, no IP addresses or cookies, and phone numbers are masked in
// anything that does get sent.
export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const PHONE = /(?<![\w+-])\+?\d[\d\s-]{8,}\d(?![\w-])/g;

export function maskPhones<T>(value: T): T {
  if (typeof value === "string") return value.replace(PHONE, "[phone]") as T;
  if (Array.isArray(value)) return value.map(maskPhones) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskPhones(v)])) as T;
  }
  return value;
}

export const sentryOptions = {
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend: <E>(event: E) => maskPhones(event),
  beforeBreadcrumb: <B>(crumb: B) => maskPhones(crumb),
};

/** Sends an error caught by an error screen to Sentry, loading the SDK only if it is in use. */
export function reportError(error: unknown) {
  if (!sentryDsn) return;
  void import("@sentry/nextjs").then((Sentry) => {
    if (!Sentry.isInitialized()) Sentry.init(sentryOptions);
    Sentry.captureException(error);
  });
}
