"use client";

import { X } from "lucide-react";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "secondary" && "border border-edge bg-surface text-ink hover:bg-ground",
        variant === "ghost" && "text-ink hover:bg-ground",
        variant === "danger" && "border border-danger/40 bg-surface text-danger hover:bg-danger/5",
        className,
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-edge bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted/70",
        "focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** A row of mutually exclusive choices (radio semantics, button looks). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-full border px-3.5 text-[13px] transition-colors",
            value === o.value
              ? "border-ink bg-ink font-medium text-surface"
              : "border-edge bg-surface text-ink hover:bg-ground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        "h-8 rounded-full border px-3 text-[13px] transition-colors",
        pressed ? "border-ink bg-ink font-medium text-surface" : "border-edge bg-surface text-ink hover:bg-ground",
      )}
    >
      {children}
    </button>
  );
}

/** Right-hand panel on desktop, full screen on phones. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside
      aria-label={title}
      className="fixed inset-0 z-40 flex flex-col bg-surface md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:border-l md:border-rule md:shadow-[-8px_0_24px_rgba(22,24,27,0.06)]"
    >
      <div className="flex items-start gap-3 px-5 pt-5 md:px-6">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="truncate text-[13px] text-ink-muted">{eyebrow}</p>}
          <h2 className="mt-0.5 font-serif text-[22px] font-medium tracking-tight">{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-ground"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
      {footer && <div className="flex items-center gap-2 border-t border-rule px-5 py-4 md:px-6">{footer}</div>}
    </aside>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-ink" />
      {label}
    </div>
  );
}
