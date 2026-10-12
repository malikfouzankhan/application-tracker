export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;

/** Signature every form action has, so it works with useActionState. */
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
