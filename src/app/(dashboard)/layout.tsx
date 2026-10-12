import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { SideNav, TopNav } from "@/components/client/nav";

// Owner-only. The proxy rejects everyone else before this renders, and every page's data
// component and every server action checks again (requireOwner).
//
// Layout: a fixed sidebar on large screens, a top bar on small ones. Content is centered with
// a 1280px cap, so wide monitors do not stretch tables edge to edge.

function Brand() {
  return (
    <Link href="/today" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">J</span>
      <span className="leading-tight">
        <span className="block font-semibold text-ink">Job search</span>
        <span className="block text-xs text-muted">jobs.fouzan.dev</span>
      </span>
    </Link>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <Suspense fallback={null}>
            <SideNav />
          </Suspense>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <UserButton />
          <span className="text-xs text-muted">Signed in</span>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <UserButton />
        </div>
        <div className="px-3 pb-2">
          <Suspense fallback={<div className="h-8" />}>
            <TopNav />
          </Suspense>
        </div>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
