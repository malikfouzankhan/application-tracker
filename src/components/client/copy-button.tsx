"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={
        className ??
        `inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          copied ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-surface text-navy hover:border-mist hover:bg-subtle"
        }`
      }
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
