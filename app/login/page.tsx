"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { normalizePhone } from "@/lib/domain/phone";
import { createClient } from "@/lib/supabase/client";
import { sendCodeError, safeNext } from "@/lib/utils";

// Set in production to require the Turnstile check before a code is sent (see docs/OPERATIONS.md).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const waitingForCheck = Boolean(TURNSTILE_SITE_KEY) && !captchaToken;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = normalizePhone(phoneInput);
    if (!parsed.ok) {
      setError("Enter a valid phone number, e.g. 98765 43210.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({
      phone: parsed.e164,
      options: captchaToken ? { captchaToken } : undefined,
    });
    setBusy(false);
    turnstile.current?.reset(); // each check token works once
    if (error) setError(sendCodeError(error.message));
    else {
      setCode("");
      setPhone(parsed.e164);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setError(null);
    setBusy(true);
    const { error } = await createClient().auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) setError("That code didn't work. Check it and try again.");
    else {
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-4 pt-16 pb-8">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      {!phone ? (
        <form onSubmit={sendCode} className="mt-12 flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight">Sign in</h1>
            <p className="mt-2 text-[15px] text-ink-muted">We'll text you a 6-digit code. No password needed.</p>
          </div>
          <Field label="Phone number" htmlFor="phone" hint="Indian numbers can skip the +91.">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              autoFocus
            />
          </Field>
          {TURNSTILE_SITE_KEY && <Turnstile ref={turnstile} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />}
          <ErrorNote message={error} />
          <Button variant="primary" type="submit" disabled={busy || !phoneInput.trim() || waitingForCheck} className="h-12">
            {busy ? "Sending…" : waitingForCheck ? "Checking you're not a robot…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-12 flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight">Enter the code</h1>
            <p className="mt-2 text-[15px] text-ink-muted">
              Sent by SMS to <span className="font-medium text-ink">{phone}</span>.{" "}
              <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => { setError(null); setPhone(null); }}>
                Change number
              </button>
            </p>
          </div>
          <Field label="6-digit code" htmlFor="code">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="font-mono text-lg tracking-[0.3em]"
              autoFocus
            />
          </Field>
          <ErrorNote message={error} />
          <Button variant="primary" type="submit" disabled={busy || code.length !== 6} className="h-12">
            {busy ? "Checking…" : "Continue"}
          </Button>
        </form>
      )}
      <p className="mt-auto pt-10 text-center text-[13px] text-ink-muted">
        Your number is only shown to people who can edit your family tree.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
