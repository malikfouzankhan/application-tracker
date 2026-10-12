"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-300 p-6 text-center">
      <p className="font-medium">Something went wrong loading this page.</p>
      <button type="button" onClick={reset} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs">
        Try again
      </button>
    </div>
  );
}
