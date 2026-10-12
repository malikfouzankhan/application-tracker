"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "Daily",
    links: [
      { href: "/today", label: "Today", icon: "M3 12h18M12 3v18" },
      { href: "/applications", label: "Applications", icon: "M4 6h16M4 12h16M4 18h10" },
      { href: "/outreach", label: "Outreach", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
    ],
  },
  {
    label: "Pipeline",
    links: [
      { href: "/jobs", label: "Jobs", icon: "M4 8h16v11H4zM9 8V5h6v3" },
      { href: "/companies", label: "Companies", icon: "M4 20V8l8-4 8 4v12M9 20v-6h6v6" },
      { href: "/stats", label: "Stats", icon: "M5 19V11M12 19V5M19 19v-8" },
    ],
  },
  {
    label: "Profile",
    links: [
      { href: "/library", label: "Library", icon: "M5 4h10l4 4v12H5zM14 4v5h5" },
      { href: "/answers", label: "Answers", icon: "M5 5h14v10H9l-4 4z" },
      { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2" },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: grouped vertical list in the sidebar. */
export function SideNav() {
  const isActive = useActive();
  return (
    <nav className="space-y-6">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-mist">{group.label}</p>
          <div className="space-y-0.5">
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(link.href) ? "bg-navy font-medium text-white shadow-sm" : "text-navy hover:bg-sky"
                }`}
              >
                <Icon d={link.icon} />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Mobile: one scrollable row. */
export function TopNav() {
  const isActive = useActive();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {GROUPS.flatMap((g) => g.links).map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive(link.href) ? "bg-navy font-medium text-white" : "text-navy hover:bg-sky"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
