"use client";

import { reportError } from "@/lib/sentry";
import { useEffect } from "react";

// Shown only if the root layout itself fails; app/error.tsx handles everything else.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 384, margin: "64px auto", padding: "0 16px" }}>
        <h1>Something went wrong</h1>
        <p>Nothing you entered was half-saved. Reload the page to try again.</p>
      </body>
    </html>
  );
}
