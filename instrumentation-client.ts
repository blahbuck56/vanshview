import { sentryDsn, sentryOptions } from "@/lib/sentry";

// Loaded after the page, and only when a DSN is set, so error reporting adds nothing to the
// first download.
if (sentryDsn) void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions));
