"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { useState } from "react";

export type SelectOption = { value: string; label: string };

// Radix items cannot have an empty value, so "Any" uses a sentinel internally and submits "".
const ANY = "__any";

/** Options often come from enum values ("careers page"); show them in sentence case. */
const sentence = (label: string) => (label ? label[0].toUpperCase() + label.slice(1) : label);

/**
 * Accessible, styled select (keyboard, screen reader, typeahead) that still works in plain HTML
 * forms: the chosen value is submitted through a hidden input named `name`.
 */
export function Select({
  name,
  options,
  defaultValue,
  anyLabel,
  label,
  inline = false,
  required = false,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string | null;
  /** Adds a first option that submits an empty value, e.g. "Any". */
  anyLabel?: string;
  /** Accessible name when there is no visible <label>. */
  label?: string;
  /** Size to content instead of filling the row. */
  inline?: boolean;
  required?: boolean;
}) {
  const initial = defaultValue && options.some((o) => o.value === defaultValue) ? defaultValue : anyLabel ? ANY : (options[0]?.value ?? ANY);
  const [value, setValue] = useState(initial);
  const items = (anyLabel ? [{ value: ANY, label: anyLabel }, ...options] : options).map((o) => ({ ...o, label: sentence(o.label) }));

  return (
    <>
      <input type="hidden" name={name} value={value === ANY ? "" : value} required={required} />
      <RadixSelect.Root value={value} onValueChange={setValue}>
        <RadixSelect.Trigger
          aria-label={label}
          className={`flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-ink outline-none transition-colors hover:border-mist focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-mist/40 data-[state=open]:border-navy ${inline ? "w-auto min-w-36" : "w-full"}`}
        >
          <span className={`truncate ${value === ANY ? "text-muted" : ""}`}>
            <RadixSelect.Value />
          </span>
          <RadixSelect.Icon className="shrink-0 text-muted">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-card"
          >
            <RadixSelect.Viewport>
              {items.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-ink outline-none data-[highlighted]:bg-sky data-[highlighted]:text-navy data-[state=checked]:font-medium"
                >
                  <RadixSelect.ItemIndicator className="absolute left-2.5 text-navy">
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path d="m5 10 3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </>
  );
}
