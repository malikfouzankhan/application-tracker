import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="rounded-lg border border-border p-8 text-center">
      <p className="font-medium">Not found</p>
      <p className="mt-1 text-muted">This item does not exist or was removed.</p>
      <Link href="/today" className="mt-3 inline-block text-accent hover:underline">
        Back to Today
      </Link>
    </div>
  );
}
