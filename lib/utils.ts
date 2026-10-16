import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Where to go after sign-in: only paths on this site ("//evil.com" or "https://…" fall back to "/"). */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

/** What to tell someone when asking for a sign-in code fails. */
export function sendCodeError(message: string): string {
  if (/captcha/i.test(message)) return "The robot check didn't go through. Wait a moment and try again.";
  if (/rate|security purposes|seconds/i.test(message)) return "Please wait a few seconds before asking for another code.";
  return "We couldn't send a code to that number. Check it and try again.";
}
