"use client";

import { useId } from "react";
import { Field, Input, Toggle } from "@/components/ui";
import { needsPhone, type DraftErrors, type PersonDraft } from "@/lib/person-draft";

/**
 * The required fields (name, location, phone for living adults) up front, plus birth/death years.
 * Living status is an explicit toggle: it can never be inferred from dates.
 */
export function PersonForm({
  value,
  onChange,
  errors = {},
  allowAskLater = true,
  showName = true,
  showGender = false,
}: {
  value: PersonDraft;
  onChange: (d: PersonDraft) => void;
  errors?: DraftErrors;
  allowAskLater?: boolean;
  showName?: boolean;
  showGender?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => onChange({ ...value, [k]: v });
  const phoneApplies = needsPhone(value);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Toggle pressed={!value.living} onChange={(dead) => onChange({ ...value, living: !dead, phone: dead ? "" : value.phone })}>
          Passed away
        </Toggle>
        {showGender && (
          <>
            <Toggle pressed={value.gender === "female"} onChange={(on) => set("gender", on ? "female" : "unknown")}>
              Female
            </Toggle>
            <Toggle pressed={value.gender === "male"} onChange={(on) => set("gender", on ? "male" : "unknown")}>
              Male
            </Toggle>
          </>
        )}
      </div>

      {showName && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor={`${id}-given`} error={errors.givenName}>
            <Input id={`${id}-given`} value={value.givenName} onChange={(e) => set("givenName", e.target.value)} />
          </Field>
          <Field label="Family name" htmlFor={`${id}-family`}>
            <Input id={`${id}-family`} value={value.familyName} onChange={(e) => set("familyName", e.target.value)} />
          </Field>
        </div>
      )}

      <Field
        label={value.living ? "Lives in" : "Last lived in"}
        htmlFor={`${id}-place`}
        error={errors.place}
        hint="A city or village is enough."
      >
        <Input
          id={`${id}-place`}
          value={value.place}
          placeholder="e.g. Pune"
          onChange={(e) => set("place", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Born" htmlFor={`${id}-born`} error={errors.born} hint="“1952” or “about 1950”">
          <Input id={`${id}-born`} value={value.born} placeholder="Optional" onChange={(e) => set("born", e.target.value)} />
        </Field>
        {!value.living && (
          <Field label="Died" htmlFor={`${id}-died`} error={errors.died}>
            <Input id={`${id}-died`} value={value.died} placeholder="Optional" onChange={(e) => set("died", e.target.value)} />
          </Field>
        )}
      </div>

      {value.living && !value.born.trim() && (
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={value.under18}
            onChange={(e) => set("under18", e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Under 18
        </label>
      )}

      {phoneApplies &&
        (value.askLater && allowAskLater ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-edge bg-ground px-3 py-3 text-[14px] text-ink">
            <span className="flex-1">Phone skipped for now. It shows as missing until someone adds it.</span>
            <button type="button" className="font-medium text-accent" onClick={() => set("askLater", false)}>
              Add number
            </button>
          </div>
        ) : (
          <Field
            label="Phone"
            htmlFor={`${id}-phone`}
            error={errors.phone}
            aside={
              allowAskLater ? (
                <button type="button" className="text-[13px] font-medium text-accent" onClick={() => set("askLater", true)}>
                  Ask later
                </button>
              ) : undefined
            }
          >
            <Input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              value={value.phone}
              placeholder="98765 43210"
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        ))}
    </div>
  );
}
