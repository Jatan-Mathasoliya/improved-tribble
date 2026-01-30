import { backfillExtractedResumeText } from "../lib/backfillResumeText";

const batchSize = Number(process.env.BACKFILL_BATCH_SIZE || 100);
const limit = Number(process.env.BACKFILL_LIMIT || 0);
const dryRun = process.env.BACKFILL_DRY_RUN === "true";

async function run(): Promise<void> {
  console.log("[Backfill] Starting extracted_resume_text backfill", {
    batchSize,
    limit: limit || "none",
    dryRun,
  });

  const result = await backfillExtractedResumeText({
    batchSize,
    limit,
    dryRun,
  });

  console.log("[Backfill] Complete", result);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Backfill] Fatal error", err);
    process.exit(1);
  });
