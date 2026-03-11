/**
 * Standalone resync script — re-fetches Signal results and re-upserts into Vanta DB.
 *
 * This populates professionalValidation, locationLabel, and refreshes candidate_summary
 * using the updated upsert logic from sourcing-sync.ts.
 *
 * Usage:
 *   DATABASE_URL=... SIGNAL_BASE_URL=... VANTAHIRE_JWT_PRIVATE_KEY=... \
 *     npx tsx scripts/resync-candidates.mts [--dry-run] [--limit N]
 */

import pg from "pg";
import { SignJWT, importPKCS8 } from "jose";

// ── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const SIGNAL_BASE_URL = (process.env.SIGNAL_BASE_URL || "").replace(/\/+$/, "");
const JWT_PRIVATE_KEY_PEM = process.env.VANTAHIRE_JWT_PRIVATE_KEY;
const JWT_KID = process.env.VANTAHIRE_JWT_ACTIVE_KID || "v1";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

if (!DATABASE_URL || !SIGNAL_BASE_URL || !JWT_PRIVATE_KEY_PEM) {
  console.error("Required env vars: DATABASE_URL, SIGNAL_BASE_URL, VANTAHIRE_JWT_PRIVATE_KEY");
  process.exit(1);
}

// ── JWT Signing ─────────────────────────────────────────────────────────────

let cachedKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

async function signJwt(tenantId: string, requestId: string): Promise<string> {
  if (!cachedKey) {
    const pem = JWT_PRIVATE_KEY_PEM!.includes("-----BEGIN")
      ? JWT_PRIVATE_KEY_PEM!
      : Buffer.from(JWT_PRIVATE_KEY_PEM!, "base64").toString("utf-8");
    cachedKey = await importPKCS8(pem, "RS256");
  }

  return new SignJWT({
    tenant_id: tenantId,
    scopes: "jobs:results",
    actor_type: "service",
    request_id: requestId,
  })
    .setProtectedHeader({ alg: "RS256", kid: JWT_KID })
    .setIssuer("vantahire")
    .setSubject("vantahire-backend")
    .setAudience("signal")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(crypto.randomUUID())
    .sign(cachedKey);
}

// ── Fit Score Normalization ─────────────────────────────────────────────────

function normalizeFitScore(fitScore: number | null | undefined): number | null {
  if (typeof fitScore !== "number" || Number.isNaN(fitScore)) return null;
  const scaled = fitScore <= 1 ? fitScore * 100 : fitScore;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

// ── Build candidate_summary blob ────────────────────────────────────────────

function buildSummary(c: any): Record<string, unknown> {
  const cand = c.candidate ?? {};
  return {
    nameHint: cand.nameHint ?? null,
    headlineHint: cand.headlineHint ?? null,
    locationHint: cand.locationHint ?? null,
    companyHint: cand.companyHint ?? null,
    linkedinUrl: cand.linkedinUrl ?? null,
    enrichmentStatus: cand.enrichmentStatus ?? null,
    confidenceScore: cand.confidenceScore ?? null,
    lastEnrichedAt: cand.lastEnrichedAt ?? c.freshness?.lastEnrichedAt ?? null,
    searchSnippet: cand.searchSnippet ?? null,
    searchMeta: cand.searchMeta ?? null,
    searchProvider: cand.searchProvider ?? null,
    searchSignals: cand.searchSignals ?? null,
    identitySummary: c.identitySummary ?? null,
    snapshot: c.snapshot ?? null,
    rank: c.rank ?? null,
    fitScoreRaw: c.fitScore ?? null,
    matchTier: c.matchTier ?? null,
    locationMatchType: c.locationMatchType ?? null,
    dataConfidence: c.dataConfidence ?? null,
    professionalValidation: c.professionalValidation ?? null,
    locationLabel: c.locationLabel ?? null,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${LIMIT ? ` (limit ${LIMIT})` : ""}`);

  // 1. Get completed sourcing runs with org's signalTenantId
  const runQuery = `
    SELECT r.id, r.organization_id, r.job_id, r.request_id, r.external_job_id,
           o.signal_tenant_id
    FROM job_sourcing_runs r
    JOIN organizations o ON o.id = r.organization_id
    WHERE r.status = 'completed'
      AND o.signal_tenant_id IS NOT NULL
    ORDER BY r.id
    ${LIMIT ? `LIMIT ${LIMIT}` : ""}
  `;

  const { rows: runs } = await pool.query(runQuery);
  console.log(`Found ${runs.length} completed runs to resync\n`);

  let totalUpserted = 0;
  let totalCandidates = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const prefix = `[${i + 1}/${runs.length}] Run ${run.id} (job ${run.job_id}, ext ${run.external_job_id})`;

    try {
      // Sign JWT for this request
      const token = await signJwt(run.signal_tenant_id, run.request_id);

      // Fetch results from Signal
      const url = `${SIGNAL_BASE_URL}/api/v3/jobs/${encodeURIComponent(run.external_job_id)}/results?requestId=${encodeURIComponent(run.request_id)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`${prefix}: Signal returned ${res.status} — ${body.slice(0, 200)}`);
        failCount++;
        continue;
      }

      const data: any = await res.json();
      const candidates: any[] = Array.isArray(data.candidates) ? data.candidates : [];

      if (candidates.length === 0) {
        console.log(`${prefix}: 0 candidates (skipped)`);
        successCount++;
        continue;
      }

      // Count new fields
      const withProfVal = candidates.filter((c: any) => c.professionalValidation != null).length;
      const withLocLabel = candidates.filter((c: any) => c.locationLabel != null).length;

      if (DRY_RUN) {
        console.log(`${prefix}: ${candidates.length} candidates (profVal: ${withProfVal}, locLabel: ${withLocLabel}) [DRY RUN]`);
        totalCandidates += candidates.length;
        successCount++;
        continue;
      }

      // Upsert each candidate
      let upserted = 0;
      for (const c of candidates) {
        const fitScore = normalizeFitScore(c.fitScore);
        const summary = buildSummary(c);

        await pool.query(
          `INSERT INTO job_sourced_candidates (
            organization_id, job_id, request_id, signal_candidate_id,
            fit_score, fit_breakdown, source_type, state,
            candidate_summary, last_synced_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'new', $8::jsonb, NOW(), NOW(), NOW())
          ON CONFLICT (job_id, signal_candidate_id) DO UPDATE SET
            request_id = EXCLUDED.request_id,
            fit_score = EXCLUDED.fit_score,
            fit_breakdown = EXCLUDED.fit_breakdown,
            source_type = EXCLUDED.source_type,
            candidate_summary = EXCLUDED.candidate_summary,
            last_synced_at = NOW(),
            updated_at = NOW()`,
          [
            run.organization_id,
            run.job_id,
            run.request_id,
            c.candidateId,
            fitScore,
            JSON.stringify(c.fitBreakdown ?? null),
            c.sourceType ?? "unknown",
            JSON.stringify(summary),
          ],
        );
        upserted++;
      }

      console.log(`${prefix}: ${upserted}/${candidates.length} upserted (profVal: ${withProfVal}, locLabel: ${withLocLabel})`);
      totalUpserted += upserted;
      totalCandidates += candidates.length;
      successCount++;

      // Small delay to avoid hammering Signal API
      if (i < runs.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error(`${prefix}: ERROR — ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`Runs processed: ${successCount} success, ${failCount} failed`);
  console.log(`Total candidates: ${totalCandidates}`);
  if (!DRY_RUN) {
    console.log(`Total upserted: ${totalUpserted}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
