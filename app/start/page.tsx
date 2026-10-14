"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PersonForm } from "@/components/person-form";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/data/family";
import { draftToPayload, emptyDraft, type DraftErrors } from "@/lib/person-draft";
import { createClient } from "@/lib/supabase/client";

export default function StartPage() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [me, setMe] = useState(emptyDraft());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-fill the phone they just signed in with.
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const phone = data.user?.phone;
        if (phone) setMe((d) => ({ ...d, phone: `+${phone.replace(/^\+/, "")}` }));
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = draftToPayload(me, { allowAskLater: false });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (!familyName.trim()) {
      setError("Give your family space a name.");
      return;
    }
    setBusy(true);
    const db = createClient();
    const { data, error } = await db.rpc("start_family", { p_name: familyName.trim(), p_self: parsed.value as never });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else router.push(`/s/${data}/wizard`);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-12 pb-16">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      <form onSubmit={submit} className="mt-10 flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-[28px] font-medium tracking-tight">Start your family tree</h1>
          <Field label="What should we call this family?" htmlFor="family" hint="Only people you invite can see it.">
            <Input
              id="family"
              placeholder="e.g. Malhotra family"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              autoFocus
            />
          </Field>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-xl font-medium">About you</h2>
          <PersonForm value={me} onChange={setMe} errors={errors} allowAskLater={false} />
        </section>
        <ErrorNote message={error} />
        <Button variant="primary" type="submit" disabled={busy} className="h-12">
          {busy ? "Creating…" : "Next: your family"}
        </Button>
      </form>
    </main>
  );
}
