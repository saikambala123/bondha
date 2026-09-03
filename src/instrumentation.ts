/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to pre-warm the MongoDB connection (in sandbox mode this also
 * downloads/boots the in-memory mongod so the first user request is fast).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureIndexes } = await import("@/lib/mongo");
    await ensureIndexes();
     
    console.log("[ApplyPilot] MongoDB warmed up and indexes ensured");
  } catch (err) {
     
    console.error("[ApplyPilot] MongoDB warmup failed:", err);
  }
}
