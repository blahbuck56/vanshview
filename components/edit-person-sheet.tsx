"use client";

import { useState } from "react";
import { PersonForm } from "@/components/person-form";
import { Button, ErrorNote, Sheet, scrollToFirstError } from "@/components/ui";
import { displayName, errorMessage, type Person } from "@/lib/data/family";
import { draftFromPerson, draftToPayload, emptyDraft, type DraftErrors } from "@/lib/person-draft";
import { createClient } from "@/lib/supabase/client";

/** Edit a person, or fill in an "Unknown father/mother" placeholder. */
export function EditPersonSheet({
  person,
  isSelf,
  onClose,
  onDone,
}: {
  person: Person;
  isSelf: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(
    person.isPlaceholder ? emptyDraft({ gender: person.gender, familyName: person.familyName ?? "" }) : draftFromPerson(person),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    const parsed = draftToPayload(draft, { allowAskLater: !isSelf });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      scrollToFirstError();
      return;
    }
    setErrors({});
    setBusy(true);
    const payload = { ...parsed.value, is_placeholder: false };
    const { error } = await createClient().rpc("update_person", { p_person_id: person.id, p: payload as never });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else onDone();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={person.isPlaceholder ? "Fill in" : "Edit"}
      title={displayName(person)}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PersonForm value={draft} onChange={setDraft} errors={errors} allowAskLater={!isSelf} isSelf={isSelf} />
        <ErrorNote message={error} />
      </div>
    </Sheet>
  );
}
