"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveApplicationAction } from "@/actions/applications";

export type KanbanCard = {
  id: string;
  status: string;
  companyName: string;
  title: string;
  locationRaw: string | null;
  tier: string | null;
  fitScore: number | null;
};

/**
 * Columns by status; drag a card to change status. Moves use the dashboard's user-override
 * rules, so any move is allowed and non-standard ones are logged as manual overrides.
 */
export function KanbanBoard({ cards, statuses }: { cards: KanbanCard[]; statuses: readonly string[] }) {
  const [optimistic, move] = useOptimistic(cards, (state, { id, status }: { id: string; status: string }) =>
    state.map((c) => (c.id === id ? { ...c, status } : c)),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  function drop(status: string, id: string) {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.status === status) return;
    startTransition(async () => {
      move({ id, status });
      const result = await moveApplicationAction(id, status);
      setError(result && !result.ok ? result.error : null);
    });
  }

  return (
    <div>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {statuses.map((status) => {
          const column = optimistic.filter((c) => c.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(status, e.dataTransfer.getData("text/plain"));
              }}
              className={`w-60 shrink-0 rounded-lg border p-2 ${over === status ? "border-accent bg-accent/5" : "border-border bg-surface"}`}
            >
              <p className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{status.replace("_", " ")}</span>
                <span>{column.length}</span>
              </p>
              <div className="min-h-16 space-y-2">
                {column.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
                    className="cursor-grab rounded-md border border-border bg-background px-4 py-3 active:cursor-grabbing"
                  >
                    <Link href={`/applications/${card.id}`} className="font-medium hover:underline">
                      {card.companyName}
                    </Link>
                    <p className="text-xs">{card.title}</p>
                    <p className="text-xs text-muted">
                      {card.locationRaw ?? ""}
                      {card.tier ? ` · ${card.tier}${card.fitScore !== null ? ` ${card.fitScore}` : ""}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
