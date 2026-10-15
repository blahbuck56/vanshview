import Link from "next/link";

/** Shown on any family page the signed-in person can't open (not a member, removed, bad link). */
export function NoAccess({ reason }: { reason?: string | null }) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 pt-16">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      <h1 className="mt-8 font-serif text-[26px] font-medium">You can't open this family</h1>
      <p className="text-ink-muted">
        {reason ?? "You're not a member of it. Ask someone in the family to send you an invite link."}
      </p>
      <Link href="/" className="text-[14px] font-medium text-accent">
        Go to your family
      </Link>
    </main>
  );
}
