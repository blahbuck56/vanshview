"use client";

import { reportError } from "@/lib/sentry";
import { useEffect } from "react";
import { Button } from "@/components/ui";

// Last-resort screen for unexpected errors, so nobody is left with a blank page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportError(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 pt-16">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      <h1 className="mt-8 font-serif text-[26px] font-medium">Something went wrong</h1>
      <p className="text-ink-muted">Nothing you entered was half-saved. Try again, or reload the page.</p>
      <Button variant="primary" className="self-start" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
