"use client";

import { useId, useState } from "react";
import { Field, Input, Segmented, Toggle } from "@/components/ui";
import { needsPhone, type DraftErrors, type PersonDraft } from "@/lib/person-draft";

/**
 * The required fields (name, location, phone for living adults) up front, plus gender, a family
 * name at birth (when it differs) and birth/death years. Living status is an explicit toggle: it
 * can never be inferred from dates.
 */
export function PersonForm({
  value,
  onChange,
  errors = {},
  allowAskLater = true,
  phoneOptional = false,
  isSelf = false,
  showName = true,
  showGender = true,
}: {
  value: PersonDraft;
  onChange: (d: PersonDraft) => void;
  errors?: DraftErrors;
  allowAskLater?: boolean;
  /** The phone may be left empty without "Ask later" (children). */
  phoneOptional?: boolean;
  /** The form is about the signed-in person: no "Passed away" or "Under 18". */
  isSelf?: boolean;
  showName?: boolean;
  /** False when the gender is already known from the role (mother, father). */
  showGender?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => onChange({ ...value, [k]: v });
  const phoneApplies = needsPhone(value);
  const [showBirthName, setShowBirthName] = useState(Boolean(value.birthFamilyName));

  return (
    <div className="flex flex-col gap-4">
      {(showGender || !isSelf) && (
        <div className="flex flex-wrap items-center gap-2">
          {showGender && (
            <Segmented
              label="Gender"
              value={value.gender === "female" || value.gender === "male" ? value.gender : null}
              onChange={(g) => set("gender", g)}
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
            />
          )}
          {showGender && !isSelf && <span className="mx-1 h-5 w-px bg-rule" />}
          {!isSelf && (
            <Toggle pressed={!value.living} onChange={(dead) => onChange({ ...value, living: !dead, phone: dead ? "" : value.phone })}>
              Passed away
            </Toggle>
          )}
        </div>
      )}

      {showName && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor={`${id}-given`} error={errors.givenName}>
              <Input id={`${id}-given`} value={value.givenName} onChange={(e) => set("givenName", e.target.value)} />
            </Field>
            <Field label="Family name" htmlFor={`${id}-family`}>
              <Input id={`${id}-family`} value={value.familyName} onChange={(e) => set("familyName", e.target.value)} />
            </Field>
          </div>
          {showBirthName ? (
            <Field label="Family name at birth" htmlFor={`${id}-birth-family`} hint="If different, e.g. before marriage. Links them to their birth family's side.">
              <Input
                id={`${id}-birth-family`}
                value={value.birthFamilyName}
                placeholder="e.g. Sharma"
                onChange={(e) => set("birthFamilyName", e.target.value)}
              />
            </Field>
          ) : (
            <button type="button" className="self-start text-[13px] font-medium text-accent" onClick={() => setShowBirthName(true)}>
              + Different family name at birth?
            </button>
          )}
        </div>
      )}

      <Field
        label={value.living ? "Lives in" : "Last lived in"}
        htmlFor={`${id}-place`}
        error={errors.place}
        hint="A city or village is enough."
      >
        <Input id={`${id}-place`} value={value.place} placeholder="e.g. Pune" onChange={(e) => set("place", e.target.value)} />
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

      {value.living && !value.born.trim() && !isSelf && (
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
        (value.askLater && allowAskLater && !phoneOptional ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-edge bg-ground px-3 py-3 text-[14px] text-ink">
            <span className="flex-1">Phone skipped for now. It shows as missing until someone adds it.</span>
            <button type="button" className="font-medium text-accent" onClick={() => set("askLater", false)}>
              Add number
            </button>
          </div>
        ) : (
          <Field
            label={phoneOptional ? "Phone (optional)" : "Phone"}
            htmlFor={`${id}-phone`}
            error={errors.phone}
            aside={
              allowAskLater && !phoneOptional ? (
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
