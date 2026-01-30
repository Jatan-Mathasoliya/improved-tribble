import { db } from "../db";
import { applications, candidateResumes } from "@shared/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { downloadFromGCS } from "../gcs-storage";
import { extractResumeText, validateResumeText } from "./resumeExtractor";

export type BackfillResumeTextResult = {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
};

export async function backfillExtractedResumeText(options?: {
  batchSize?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<BackfillResumeTextResult> {
  const batchSize = options?.batchSize ?? 100;
  const limit = options?.limit ?? 0;
  const dryRun = options?.dryRun ?? false;

  let lastId = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const start = Date.now();

  while (true) {
    const rows = await db
      .select({
        id: applications.id,
        resumeId: applications.resumeId,
        resumeUrl: applications.resumeUrl,
      })
      .from(applications)
      .where(and(isNull(applications.extractedResumeText), gt(applications.id, lastId)))
      .orderBy(applications.id)
      .limit(batchSize);

    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    for (const row of rows) {
      processed++;
      if (limit && processed > limit) {
        return {
          processed,
          updated,
          skipped,
          errors,
          durationMs: Date.now() - start,
        };
      }

      try {
        let extractedText: string | null = null;

        if (row.resumeId) {
          const resume = await db.query.candidateResumes.findFirst({
            where: eq(candidateResumes.id, row.resumeId),
            columns: { extractedText: true },
          });
          if (resume?.extractedText && validateResumeText(resume.extractedText)) {
            extractedText = resume.extractedText;
          }
        }

        if (!extractedText && row.resumeUrl && row.resumeUrl.startsWith("gs://")) {
          const buffer = await downloadFromGCS(row.resumeUrl);
          const extraction = await extractResumeText(buffer);
          if (extraction.success && validateResumeText(extraction.text)) {
            extractedText = extraction.text;
          }
        }

        if (!extractedText) {
          skipped++;
          continue;
        }

        if (!dryRun) {
          await db
            .update(applications)
            .set({ extractedResumeText: extractedText })
            .where(eq(applications.id, row.id));
        }
        updated++;
      } catch (err) {
        errors++;
        console.error("[Backfill] Failed for application", row.id, err);
      }
    }
  }

  return {
    processed,
    updated,
    skipped,
    errors,
    durationMs: Date.now() - start,
  };
}
