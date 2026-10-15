import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 pt-16">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      <h1 className="mt-8 font-serif text-[26px] font-medium">There's nothing here</h1>
      <p className="text-ink-muted">The link may be mistyped or out of date.</p>
      <Link href="/" className="text-[14px] font-medium text-accent">
        Go to your family
      </Link>
    </main>
  );
}
