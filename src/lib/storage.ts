import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Supabase Storage, server-side only, with the secret key (claude.md section 2). The bucket is
// private; files are streamed through /r/[variantId], so storage URLs never leave the server.

const BUCKET = "resumes";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let bucketReady: Promise<void> | null = null;

/** Creates the private bucket on first use, and refuses to work with a public one. */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) {
      if (data.public) throw new Error(`Storage bucket "${BUCKET}" is public; make it private`);
      return;
    }
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      allowedMimeTypes: ["application/pdf"],
      fileSizeLimit: "5MB",
    });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create bucket: ${error.message}`);
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

export async function uploadPdf(path: string, pdf: Buffer): Promise<void> {
  await ensureBucket();
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false, // approved resumes are immutable
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function downloadPdf(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}
