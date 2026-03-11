/**
 * Re-source validation script — triggers new sourcing runs for 29 validation jobs.
 *
 * 1. Reads job details from Vanta DB
 * 2. Deletes old Signal requests (bypasses idempotency)
 * 3. Calls Signal source API for each job
 * 4. Inserts Vanta run records so callbacks land correctly
 * 5. Monitors completion
 *
 * Usage:
 *   npx tsx scripts/resurface-validation.mts [--dry-run] [--monitor]
 */

import pg from "pg";
import { SignJWT, importPKCS8 } from "jose";
import { createHash } from "crypto";

// ── Config ──────────────────────────────────────────────────────────────────

const VANTA_DB_URL = process.env.VANTA_DATABASE_URL;
const SIGNAL_DB_URL = process.env.SIGNAL_DATABASE_URL;
const SIGNAL_BASE_URL = (process.env.SIGNAL_BASE_URL || "").replace(/\/+$/, "");
const JWT_PRIVATE_KEY_PEM = process.env.VANTAHIRE_JWT_PRIVATE_KEY;
const JWT_KID = process.env.VANTAHIRE_JWT_ACTIVE_KID || "v1";
const VANTA_BASE_URL = (process.env.VANTA_BASE_URL || "").replace(/\/+$/, "");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MONITOR = args.includes("--monitor");

if (!VANTA_DB_URL || !SIGNAL_DB_URL || !SIGNAL_BASE_URL || !JWT_PRIVATE_KEY_PEM || !VANTA_BASE_URL) {
  console.error("Required env vars: VANTA_DATABASE_URL, SIGNAL_DATABASE_URL, SIGNAL_BASE_URL, VANTAHIRE_JWT_PRIVATE_KEY, VANTA_BASE_URL");
  process.exit(1);
}

// ── Validation job IDs (29 jobs, balanced by track) ─────────────────────────

const VALIDATION_JOB_IDS = [
  // blended (5)
  93, 90, 55, 52, 51,
  // non_tech (12)
  100, 99, 97, 96, 94, 91, 89, 85, 82, 80, 76, 74,
  // tech (12)
  98, 95, 92, 88, 87, 86, 84, 83, 81, 79, 78, 77,
];

// ── JWT Signing ─────────────────────────────────────────────────────────────

let cachedKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

async function signJwt(tenantId: string, scopes: string): Promise<string> {
  if (!cachedKey) {
    const pem = JWT_PRIVATE_KEY_PEM!.includes("-----BEGIN")
      ? JWT_PRIVATE_KEY_PEM!
      : Buffer.from(JWT_PRIVATE_KEY_PEM!, "base64").toString("utf-8");
    cachedKey = await importPKCS8(pem, "RS256");
  }

  return new SignJWT({
    tenant_id: tenantId,
    scopes,
    actor_type: "service",
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

// ── Context hash (matches Vanta's computeContextHash) ───────────────────────

const CONTEXT_HASH_VERSION = 4;

function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function normalizeSkillList(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const normalized = skills
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().toLowerCase());
  return [...new Set(normalized)].sort();
}

function computeContextHash(job: {
  jd_digest: unknown;
  jd_digest_version: number | null;
  title: string;
  skills: unknown;
  good_to_have_skills: unknown;
  location: string;
  experience_years: number | null;
  education_requirement: string | null;
}): string {
  const input = {
    jdDigest: (job.jd_digest as Record<string, unknown>) ?? null,
    jdDigestVersion: job.jd_digest_version ?? null,
    title: job.title,
    skills: normalizeSkillList(job.skills),
    goodToHaveSkills: normalizeSkillList(job.good_to_have_skills),
    location: job.location,
    experienceYears: job.experience_years ?? null,
    educationRequirement: job.education_requirement ?? null,
    contextVersion: CONTEXT_HASH_VERSION,
  };
  const canonical = JSON.stringify(deepSortKeys(input));
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const vantaPool = new pg.Pool({
    connectionString: VANTA_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const signalPool = new pg.Pool({
    connectionString: SIGNAL_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Jobs: ${VALIDATION_JOB_IDS.length}`);

  // 1. Get job details + org context from Vanta DB
  const { rows: jobs } = await vantaPool.query(`
    SELECT j.id, j.title, j.location, j.description, j.skills, j.good_to_have_skills,
           j.experience_years, j.education_requirement,
           j.jd_digest, j.jd_digest_version,
           j.organization_id,
           o.signal_tenant_id
    FROM jobs j
    JOIN organizations o ON o.id = j.organization_id
    WHERE j.id = ANY($1)
      AND o.signal_tenant_id IS NOT NULL
    ORDER BY j.id
  `, [VALIDATION_JOB_IDS]);

  console.log(`Found ${jobs.length}/${VALIDATION_JOB_IDS.length} eligible jobs\n`);

  if (jobs.length !== VALIDATION_JOB_IDS.length) {
    const foundIds = new Set(jobs.map((j: any) => j.id));
    const missing = VALIDATION_JOB_IDS.filter((id) => !foundIds.has(id));
    console.warn(`Missing jobs: ${missing.join(", ")}`);
  }

  // 2. Build external job IDs
  const externalJobIds = jobs.map((j: any) => `vanta:jobs:${j.id}`);

  // 3. Delete old Signal requests for these jobs (bypass idempotency)
  //    Must delete candidates first due to FK constraint
  if (!DRY_RUN) {
    const { rows: reqIds } = await signalPool.query(
      `SELECT id FROM job_sourcing_requests WHERE "externalJobId" = ANY($1)`,
      [externalJobIds],
    );
    const ids = reqIds.map((r: any) => r.id);
    if (ids.length > 0) {
      const { rowCount: candCount } = await signalPool.query(
        `DELETE FROM job_sourcing_candidates WHERE "sourcingRequestId" = ANY($1)`,
        [ids],
      );
      console.log(`Cleared ${candCount} old Signal candidates`);
      const { rowCount } = await signalPool.query(
        `DELETE FROM job_sourcing_requests WHERE id = ANY($1)`,
        [ids],
      );
      console.log(`Cleared ${rowCount} old Signal requests\n`);
    } else {
      console.log(`No old Signal requests to clear\n`);
    }
  } else {
    const { rows: oldReqs } = await signalPool.query(
      `SELECT COUNT(*) AS cnt FROM job_sourcing_requests WHERE "externalJobId" = ANY($1)`,
      [externalJobIds],
    );
    console.log(`Would clear ${oldReqs[0].cnt} old Signal requests [DRY RUN]\n`);
  }

  // 4. Trigger sourcing for each job
  const callbackUrl = `${VANTA_BASE_URL}/api/webhooks/signal/callback`;
  let successCount = 0;
  let failCount = 0;
  const runRecords: Array<{ jobId: number; requestId: string; status: string }> = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const externalJobId = `vanta:jobs:${job.id}`;
    const prefix = `[${i + 1}/${jobs.length}] Job ${job.id} (${job.title.slice(0, 40)})`;

    try {
      // Build source request
      const sourceRequest = {
        jobContext: {
          jdDigest: JSON.stringify(job.jd_digest),
          title: job.title,
          skills: normalizeSkillList(job.skills),
          goodToHaveSkills: normalizeSkillList(job.good_to_have_skills),
          location: job.location,
          experienceYears: job.experience_years ?? undefined,
          education: job.education_requirement ?? undefined,
        },
        callbackUrl,
      };

      if (DRY_RUN) {
        console.log(`${prefix}: would source → ${SIGNAL_BASE_URL}/api/v3/jobs/${externalJobId}/source [DRY RUN]`);
        successCount++;
        continue;
      }

      // Sign JWT
      const token = await signJwt(job.signal_tenant_id, "jobs:source");

      // Call Signal source API
      const url = `${SIGNAL_BASE_URL}/api/v3/jobs/${encodeURIComponent(externalJobId)}/source`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sourceRequest),
      });

      const body: any = await res.json();

      if (!res.ok) {
        console.error(`${prefix}: Signal returned ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
        failCount++;
        continue;
      }

      const requestId = body.requestId;
      const idempotent = body.idempotent ?? false;
      console.log(`${prefix}: queued (requestId=${requestId}, idempotent=${idempotent}, track=${body.trackDecision?.track ?? "?"})`);

      // 5. Insert Vanta run record so callback can find it
      const contextHash = computeContextHash(job);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      try {
        await vantaPool.query(
          `INSERT INTO job_sourcing_runs
            (organization_id, job_id, request_id, external_job_id, status, context_hash, callback_url, expires_at, submitted_at, meta, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'submitted', $5, $6, $7, NOW(), $8, NOW(), NOW())
           ON CONFLICT (request_id) DO NOTHING`,
          [
            job.organization_id,
            job.id,
            requestId,
            externalJobId,
            contextHash,
            callbackUrl,
            expiresAt,
            JSON.stringify({ requestedLocation: job.location, validationBatch: "cap_enforcement_v1" }),
          ],
        );
      } catch (insertErr: any) {
        // 23505 = unique_violation — run already exists (idempotent case)
        if (insertErr.code !== "23505") throw insertErr;
        console.log(`  → Run record already exists for ${requestId}`);
      }

      runRecords.push({ jobId: job.id, requestId, status: "submitted" });
      successCount++;

      // Small delay between requests
      if (i < jobs.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err: any) {
      console.error(`${prefix}: ERROR — ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n── Submission Summary ──`);
  console.log(`Submitted: ${successCount}, Failed: ${failCount}`);

  // 6. Monitor completion if requested
  if (MONITOR && !DRY_RUN && runRecords.length > 0) {
    console.log(`\nMonitoring ${runRecords.length} runs for completion...\n`);
    const requestIds = runRecords.map((r) => r.requestId);
    const startTime = Date.now();
    const maxWait = 15 * 60 * 1000; // 15 minutes

    while (Date.now() - startTime < maxWait) {
      const { rows: statuses } = await vantaPool.query(
        `SELECT request_id, status, candidate_count
         FROM job_sourcing_runs
         WHERE request_id = ANY($1)`,
        [requestIds],
      );

      const statusMap = new Map(statuses.map((s: any) => [s.request_id, s]));
      const completed = statuses.filter((s: any) => s.status === "completed").length;
      const failed = statuses.filter((s: any) => s.status === "failed").length;
      const pending = runRecords.length - completed - failed;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r  [${elapsed}s] Completed: ${completed}, Failed: ${failed}, Pending: ${pending}   `);

      if (pending === 0) {
        console.log("\n\nAll runs finished!");
        break;
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    // Final status
    const { rows: finalStatuses } = await vantaPool.query(
      `SELECT r.request_id, r.status, r.candidate_count, r.job_id,
              r.meta->'trackDecision'->>'track' AS track
       FROM job_sourcing_runs r
       WHERE request_id = ANY($1)
       ORDER BY r.job_id`,
      [requestIds],
    );

    console.log(`\n── Final Status ──`);
    for (const s of finalStatuses) {
      console.log(`  Job ${s.job_id} [${s.track ?? "?"}]: ${s.status} (${s.candidate_count ?? 0} candidates)`);
    }

    const completedRuns = finalStatuses.filter((s: any) => s.status === "completed");
    const totalCandidates = completedRuns.reduce((sum: number, s: any) => sum + (s.candidate_count ?? 0), 0);
    console.log(`\nCompleted: ${completedRuns.length}/${finalStatuses.length}`);
    console.log(`Total candidates: ${totalCandidates}`);
  }

  await vantaPool.end();
  await signalPool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
