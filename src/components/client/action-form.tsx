"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult, FormAction } from "@/actions/types";

/** A form bound to a server action, with pending state and an inline error/success message. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Ask before submitting, e.g. for bulk changes. */
  confirm?: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && !state.ok ? <p className="mt-1 basis-full text-xs text-red-600">{state.error}</p> : null}
      {state?.ok && state.message ? <p className="mt-1 basis-full text-xs text-emerald-700">{state.message}</p> : null}
    </form>
  );
}

export function SubmitButton({ children, className, pendingLabel }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
