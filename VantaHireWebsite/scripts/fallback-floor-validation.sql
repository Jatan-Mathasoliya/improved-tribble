-- =============================================================================
-- Fallback Floor 0.35→0.30 Validation Suite
-- =============================================================================
-- Cohort split: unknownLocationPromotedCount presence in diagnostics
--   Baseline = runs with diagnostics but NO unknownLocationPromotedCount (0.35)
--   Test     = runs WITH unknownLocationPromotedCount (0.30)
-- =============================================================================

-- ─── SECTION 0: Cohort Definition ───────────────────────────────────────────

WITH run_cohorts AS (
  SELECT
    r.id AS run_id,
    r.job_id,
    r.request_id,
    r.created_at,
    r.created_at::date AS dt,
    CASE
      WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
      WHEN meta->'diagnostics' IS NOT NULL THEN 'baseline'
      ELSE 'pre_diag'
    END AS cohort,
    meta->'diagnostics'->'trackDecision'->>'track' AS track,
    meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
    (meta->'diagnostics'->>'discoveredCount')::int AS discovered_count,
    (meta->'diagnostics'->>'discoveredPromotedCount')::int AS discovered_promoted,
    (meta->'diagnostics'->>'unknownLocationPromotedCount')::int AS unk_loc_promoted,
    (meta->'diagnostics'->>'poolCount')::int AS pool_count,
    (meta->'diagnostics'->>'avgFitTopK')::numeric AS avg_fit_topk,
    (meta->'diagnostics'->>'strictTopKCount')::int AS strict_topk,
    (meta->'diagnostics'->>'strictRescuedCount')::int AS strict_rescued,
    meta->'diagnostics'->>'expansionReason' AS expansion_reason,
    meta->>'firstEngagementReadySeenAt' AS first_er_seen_at
  FROM job_sourcing_runs r
  WHERE r.status = 'completed'
)

-- ─── 1A: Cohort summary ────────────────────────────────────────────────────
SELECT '1A: COHORT SUMMARY' AS section, * FROM (
  SELECT
    cohort,
    COUNT(*) AS runs,
    COUNT(DISTINCT job_id) AS distinct_jobs,
    MIN(dt) AS first_run,
    MAX(dt) AS last_run,
    -- Track breakdown
    COUNT(*) FILTER (WHERE track = 'tech') AS tech_runs,
    COUNT(*) FILTER (WHERE track = 'non_tech') AS non_tech_runs,
    COUNT(*) FILTER (WHERE track = 'blended') AS blended_runs,
    -- Role family breakdown
    COUNT(*) FILTER (WHERE role_family = 'technical_account_manager') AS tam_runs,
    COUNT(*) FILTER (WHERE role_family = 'customer_success') AS cs_runs,
    COUNT(*) FILTER (WHERE role_family = 'account_executive') AS ae_runs,
    COUNT(*) FILTER (WHERE role_family = 'backend') AS backend_runs,
    COUNT(*) FILTER (WHERE role_family = 'devops') AS devops_runs
  FROM run_cohorts
  WHERE cohort != 'pre_diag'
  GROUP BY cohort
  ORDER BY cohort
) t;


-- ─── SECTION 2: Data Integrity Checks ──────────────────────────────────────

-- 2.1: unknown_location not dropped
SELECT '2.1: UNKNOWN_LOCATION MAPPING' AS section, * FROM (
  SELECT
    COUNT(*) AS total_candidates,
    COUNT(*) FILTER (WHERE candidate_summary->>'locationMatchType' = 'unknown_location') AS has_unknown_location,
    COUNT(*) FILTER (WHERE candidate_summary->>'locationMatchType' IS NULL) AS null_location_type,
    COUNT(*) FILTER (WHERE candidate_summary->>'locationMatchType' IN ('city_exact','city_alias','country_only','none','unknown_location')) AS valid_type_count
  FROM job_sourced_candidates
) t;

-- 2.2: locationLabel coverage in recent runs
SELECT '2.2: LOCATION_LABEL COVERAGE' AS section, * FROM (
  SELECT
    CASE WHEN r.created_at >= '2026-03-07' THEN 'test' ELSE 'baseline' END AS cohort,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE c.candidate_summary->>'locationLabel' IS NOT NULL) AS has_loc_label,
    ROUND(COUNT(*) FILTER (WHERE c.candidate_summary->>'locationLabel' IS NOT NULL)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS pct
  FROM job_sourced_candidates c
  JOIN job_sourcing_runs r ON r.request_id = c.request_id
  WHERE r.status = 'completed' AND r.meta->'diagnostics' IS NOT NULL
  GROUP BY 1
  ORDER BY 1
) t;

-- 2.3: professionalValidation trend
SELECT '2.3: PROF_VALIDATION TREND' AS section, * FROM (
  SELECT
    r.created_at::date AS dt,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE c.candidate_summary->>'professionalValidation' IS NOT NULL) AS has_prof_val,
    ROUND(COUNT(*) FILTER (WHERE c.candidate_summary->>'professionalValidation' IS NOT NULL)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS pct
  FROM job_sourced_candidates c
  JOIN job_sourcing_runs r ON r.request_id = c.request_id
  WHERE r.status = 'completed' AND r.meta->'diagnostics' IS NOT NULL
  GROUP BY 1
  ORDER BY 1
) t;

-- 2.4: fit_score scale check
SELECT '2.4: FIT_SCORE SCALE' AS section, * FROM (
  SELECT
    MIN(fit_score) AS min_fit,
    MAX(fit_score) AS max_fit,
    ROUND(AVG(fit_score)::numeric, 1) AS avg_fit,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fit_score) AS p50_fit,
    COUNT(*) FILTER (WHERE fit_score > 100) AS gt_100_count,
    COUNT(*) FILTER (WHERE fit_score < 0) AS lt_0_count,
    COUNT(*) FILTER (WHERE fit_score IS NULL) AS null_count
  FROM job_sourced_candidates
) t;

-- 2.5: firstEngagementReadySeenAt in post-deploy runs
SELECT '2.5: FIRST_ER_SEEN_AT' AS section, * FROM (
  SELECT
    CASE
      WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
      ELSE 'baseline'
    END AS cohort,
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE meta->>'firstEngagementReadySeenAt' IS NOT NULL) AS has_first_er,
    ROUND(COUNT(*) FILTER (WHERE meta->>'firstEngagementReadySeenAt' IS NOT NULL)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS pct
  FROM job_sourcing_runs
  WHERE status = 'completed' AND meta->'diagnostics' IS NOT NULL
  GROUP BY 1
  ORDER BY 1
) t;


-- ─── SECTION 3: Core Tuning Outcomes (0.30 Decision) ───────────────────────

-- Need run_cohorts CTE again
-- 3.1: discoveredPromotedCount by cohort × track × role_family
SELECT '3.1: DISCOVERED_PROMOTED BY COHORT/TRACK/ROLE' AS section, * FROM (
  WITH rc AS (
    SELECT
      r.id AS run_id,
      CASE
        WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      meta->'diagnostics'->'trackDecision'->>'track' AS track,
      meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      (meta->'diagnostics'->>'discoveredPromotedCount')::int AS disc_promoted,
      (meta->'diagnostics'->>'discoveredCount')::int AS disc_count
    FROM job_sourcing_runs r
    WHERE r.status = 'completed' AND meta->'diagnostics' IS NOT NULL
  )
  SELECT
    cohort,
    track,
    role_family,
    COUNT(*) AS runs,
    ROUND(AVG(disc_promoted)::numeric, 1) AS avg_promoted,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(disc_promoted,0)) AS p50_promoted,
    COUNT(*) FILTER (WHERE COALESCE(disc_promoted,0) > 0) AS runs_with_promoted,
    ROUND(COUNT(*) FILTER (WHERE COALESCE(disc_promoted,0) > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS pct_runs_with_promoted,
    ROUND(AVG(disc_count)::numeric, 1) AS avg_discovered,
    SUM(COALESCE(disc_promoted,0)) AS total_promoted
  FROM rc
  GROUP BY GROUPING SETS ((cohort, track, role_family), (cohort, track), (cohort))
  ORDER BY cohort, track NULLS FIRST, role_family NULLS FIRST
) t;

-- 3.2: TAM/blended-specific discoveredPromotedCount uplift
SELECT '3.2: TAM/BLENDED PROMOTED UPLIFT' AS section, * FROM (
  WITH rc AS (
    SELECT
      r.id,
      CASE
        WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      meta->'diagnostics'->'trackDecision'->>'track' AS track,
      meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      (meta->'diagnostics'->>'discoveredPromotedCount')::int AS disc_promoted
    FROM job_sourcing_runs r
    WHERE r.status = 'completed' AND meta->'diagnostics' IS NOT NULL
      AND (
        meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' = 'technical_account_manager'
        OR meta->'diagnostics'->'trackDecision'->>'track' = 'blended'
      )
  )
  SELECT
    cohort,
    track,
    role_family,
    COUNT(*) AS runs,
    SUM(COALESCE(disc_promoted,0)) AS total_promoted,
    ROUND(AVG(COALESCE(disc_promoted,0))::numeric, 1) AS avg_promoted,
    COUNT(*) FILTER (WHERE COALESCE(disc_promoted,0) > 0) AS runs_with_any_promoted,
    ROUND(COUNT(*) FILTER (WHERE COALESCE(disc_promoted,0) > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS pct_runs_with_promoted
  FROM rc
  GROUP BY cohort, track, role_family
  ORDER BY cohort, track, role_family
) t;

-- 3.3: top20 precision by cohort × track (fit_score >= 50 in top-20)
SELECT '3.3: TOP20 PRECISION BY COHORT/TRACK' AS section, * FROM (
  WITH ranked AS (
    SELECT
      c.job_id,
      c.request_id,
      c.fit_score,
      (c.candidate_summary->>'rank')::int AS sig_rank,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      rm.meta->'diagnostics'->'trackDecision'->>'track' AS track
    FROM job_sourced_candidates c
    JOIN job_sourcing_runs rm ON rm.request_id = c.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
      AND (c.candidate_summary->>'rank')::int <= 20
  )
  SELECT
    cohort,
    track,
    COUNT(*) AS top20_candidates,
    COUNT(*) FILTER (WHERE fit_score >= 50) AS fit_gte50,
    ROUND(COUNT(*) FILTER (WHERE fit_score >= 50)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS precision_pct,
    ROUND(AVG(fit_score)::numeric, 1) AS avg_fit_top20,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fit_score) AS p50_fit_top20
  FROM ranked
  GROUP BY GROUPING SETS ((cohort, track), (cohort))
  ORDER BY cohort, track NULLS FIRST
) t;

-- 3.4: per-run top20 precision (to compute p50/p90 per cohort)
SELECT '3.4: PER-RUN TOP20 PRECISION DISTRIBUTION' AS section, * FROM (
  WITH per_run_precision AS (
    SELECT
      c.request_id,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      rm.meta->'diagnostics'->'trackDecision'->>'track' AS track,
      COUNT(*) AS top20_cnt,
      COUNT(*) FILTER (WHERE c.fit_score >= 50) AS fit_gte50,
      ROUND(COUNT(*) FILTER (WHERE c.fit_score >= 50)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS precision_pct
    FROM job_sourced_candidates c
    JOIN job_sourcing_runs rm ON rm.request_id = c.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
      AND (c.candidate_summary->>'rank')::int <= 20
    GROUP BY c.request_id, 2, 3
  )
  SELECT
    cohort,
    track,
    COUNT(*) AS runs,
    ROUND(AVG(precision_pct)::numeric, 1) AS avg_precision,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precision_pct) AS p50_precision,
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY precision_pct) AS p10_precision,
    MIN(precision_pct) AS min_precision
  FROM per_run_precision
  GROUP BY GROUPING SETS ((cohort, track), (cohort))
  ORDER BY cohort, track NULLS FIRST
) t;

-- 3.5: unknownLocationPromotedCount caps
SELECT '3.5: UNKNOWN_LOCATION CAPS' AS section, * FROM (
  WITH rc AS (
    SELECT
      r.id,
      meta->'diagnostics'->'trackDecision'->>'track' AS track,
      meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      (meta->'diagnostics'->>'unknownLocationPromotedCount')::int AS unk_promoted,
      100 AS total_output  -- all runs produce 100 candidates
    FROM job_sourcing_runs r
    WHERE r.status = 'completed'
      AND meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL
  )
  SELECT
    track,
    role_family,
    COUNT(*) AS runs,
    ROUND(AVG(unk_promoted)::numeric, 1) AS avg_unk_promoted,
    MAX(unk_promoted) AS max_unk_promoted,
    ROUND(AVG(unk_promoted)::numeric / 100 * 100, 1) AS avg_unk_pct,
    ROUND(MAX(unk_promoted)::numeric / 100 * 100, 1) AS max_unk_pct,
    -- Cap check
    CASE
      WHEN track = 'tech' AND MAX(unk_promoted) > 10 THEN 'FAIL (>10%)'
      WHEN track IN ('non_tech','blended') AND MAX(unk_promoted) > 20 THEN 'FAIL (>20%)'
      ELSE 'PASS'
    END AS cap_check
  FROM rc
  GROUP BY track, role_family
  ORDER BY track, role_family
) t;


-- ─── SECTION 4: Secondary Quality Checks ───────────────────────────────────

-- 4.1: firstQualifiedCandidateRank by cohort
SELECT '4.1: FIRST_QUALIFIED_RANK BY COHORT' AS section, * FROM (
  WITH er_ranks AS (
    SELECT
      c.request_id,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      rm.meta->'diagnostics'->'trackDecision'->>'track' AS track,
      MIN((c.candidate_summary->>'rank')::int) FILTER (
        WHERE c.fit_score >= 55
          AND c.candidate_summary->>'locationMatchType' IN ('city_exact','city_alias','country_only')
          AND c.candidate_summary->>'enrichmentStatus' NOT IN ('pending')
      ) AS first_er_rank
    FROM job_sourced_candidates c
    JOIN job_sourcing_runs rm ON rm.request_id = c.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
    GROUP BY c.request_id, 2, 3
  )
  SELECT
    cohort,
    track,
    COUNT(*) AS runs,
    COUNT(*) FILTER (WHERE first_er_rank IS NOT NULL) AS runs_with_er,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(first_er_rank, 999)) AS p50_rank,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY COALESCE(first_er_rank, 999)) AS p90_rank,
    ROUND(AVG(first_er_rank)::numeric, 1) AS avg_rank
  FROM er_ranks
  GROUP BY GROUPING SETS ((cohort, track), (cohort))
  ORDER BY cohort, track NULLS FIRST
) t;

-- 4.2: engagementReady count trend by cohort
SELECT '4.2: ENGAGEMENT_READY COUNT BY COHORT' AS section, * FROM (
  WITH er_counts AS (
    SELECT
      c.request_id,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      rm.meta->'diagnostics'->'trackDecision'->>'track' AS track,
      COUNT(*) FILTER (
        WHERE c.fit_score >= 55
          AND c.candidate_summary->>'locationMatchType' IN ('city_exact','city_alias','country_only')
          AND c.candidate_summary->>'enrichmentStatus' NOT IN ('pending')
      ) AS er_count
    FROM job_sourced_candidates c
    JOIN job_sourcing_runs rm ON rm.request_id = c.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
    GROUP BY c.request_id, 2, 3
  )
  SELECT
    cohort,
    track,
    COUNT(*) AS runs,
    ROUND(AVG(er_count)::numeric, 1) AS avg_er_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY er_count) AS p50_er,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY er_count) AS p90_er,
    MIN(er_count) AS min_er,
    MAX(er_count) AS max_er
  FROM er_counts
  GROUP BY GROUPING SETS ((cohort, track), (cohort))
  ORDER BY cohort, track NULLS FIRST
) t;

-- 4.3: Backend/Platform canary check (no tech regression)
SELECT '4.3: TECH CANARY (BACKEND/DEVOPS)' AS section, * FROM (
  WITH tech_runs AS (
    SELECT
      r.id,
      r.request_id,
      CASE
        WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      (meta->'diagnostics'->>'avgFitTopK')::numeric AS avg_fit_topk,
      (meta->'diagnostics'->>'discoveredPromotedCount')::int AS disc_promoted
    FROM job_sourcing_runs r
    WHERE r.status = 'completed'
      AND meta->'diagnostics'->'trackDecision'->>'track' = 'tech'
      AND meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' IN ('backend','devops','frontend','platform')
  ),
  tech_precision AS (
    SELECT
      tr.request_id,
      tr.cohort,
      tr.role_family,
      tr.avg_fit_topk,
      COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20) AS fit_gte50_top20,
      COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20) AS total_top20
    FROM tech_runs tr
    JOIN job_sourced_candidates c ON c.request_id = tr.request_id
    GROUP BY tr.request_id, tr.cohort, tr.role_family, tr.avg_fit_topk
  )
  SELECT
    cohort,
    role_family,
    COUNT(*) AS runs,
    ROUND(AVG(avg_fit_topk)::numeric, 4) AS avg_fit_topk,
    ROUND(AVG(CASE WHEN total_top20 > 0 THEN fit_gte50_top20::numeric / total_top20 * 100 END)::numeric, 1) AS avg_precision_pct
  FROM tech_precision
  GROUP BY cohort, role_family
  ORDER BY cohort, role_family
) t;


-- ─── SECTION 5: Outlier Review ─────────────────────────────────────────────

-- 5.1: Worst 10 runs by top-20 precision
SELECT '5.1: WORST 10 RUNS BY PRECISION' AS section, * FROM (
  WITH per_run AS (
    SELECT
      rm.id AS run_id,
      rm.created_at::date AS dt,
      rm.meta->'diagnostics'->'trackDecision'->>'track' AS track,
      rm.meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      rm.meta->'diagnostics'->>'requestedLocation' AS req_location,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20) AS top20_cnt,
      COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20) AS fit_gte50_top20,
      ROUND(
        COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20), 0) * 100
      , 1) AS precision_pct
    FROM job_sourcing_runs rm
    JOIN job_sourced_candidates c ON c.request_id = rm.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
    GROUP BY rm.id, rm.created_at, rm.meta
  )
  SELECT run_id, dt, cohort, track, role_family, req_location, top20_cnt, fit_gte50_top20, precision_pct
  FROM per_run
  WHERE top20_cnt > 0
  ORDER BY precision_pct ASC, run_id
  LIMIT 10
) t;

-- 5.2: Worst 10 runs by unknown-location share (test cohort only)
SELECT '5.2: WORST 10 BY UNKNOWN_LOC SHARE (TEST)' AS section, * FROM (
  SELECT
    r.id AS run_id,
    r.created_at::date AS dt,
    meta->'diagnostics'->'trackDecision'->>'track' AS track,
    meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
    meta->'diagnostics'->>'requestedLocation' AS req_location,
    (meta->'diagnostics'->>'unknownLocationPromotedCount')::int AS unk_promoted,
    (meta->'diagnostics'->>'discoveredPromotedCount')::int AS disc_promoted,
    (meta->'diagnostics'->>'discoveredCount')::int AS disc_count
  FROM job_sourcing_runs r
  WHERE r.status = 'completed'
    AND meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL
  ORDER BY (meta->'diagnostics'->>'unknownLocationPromotedCount')::int DESC
  LIMIT 10
) t;

-- 5.3: Cohort collapse check (same role+geo repeated failures)
SELECT '5.3: COHORT COLLAPSE CHECK' AS section, * FROM (
  WITH per_run AS (
    SELECT
      rm.id AS run_id,
      rm.meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' AS role_family,
      rm.meta->'diagnostics'->>'requestedLocation' AS req_location,
      CASE
        WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test'
        ELSE 'baseline'
      END AS cohort,
      ROUND(
        COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20), 0) * 100
      , 1) AS precision_pct
    FROM job_sourcing_runs rm
    JOIN job_sourced_candidates c ON c.request_id = rm.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
    GROUP BY rm.id, rm.meta
  )
  SELECT
    role_family,
    req_location,
    cohort,
    COUNT(*) AS runs,
    ROUND(AVG(precision_pct)::numeric, 1) AS avg_precision,
    MIN(precision_pct) AS min_precision,
    COUNT(*) FILTER (WHERE precision_pct < 30) AS low_precision_runs
  FROM per_run
  WHERE precision_pct IS NOT NULL
  GROUP BY role_family, req_location, cohort
  HAVING COUNT(*) >= 2
  ORDER BY avg_precision ASC
  LIMIT 15
) t;


-- ─── SECTION 6: Go/No-Go Summary ───────────────────────────────────────────

SELECT '6: GO/NO-GO SUMMARY' AS section, * FROM (
  WITH
  -- TAM/blended uplift
  tam_uplift AS (
    SELECT
      CASE WHEN meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test' ELSE 'baseline' END AS cohort,
      ROUND(AVG(COALESCE((meta->'diagnostics'->>'discoveredPromotedCount')::int, 0))::numeric, 2) AS avg_promoted,
      COUNT(*) FILTER (WHERE COALESCE((meta->'diagnostics'->>'discoveredPromotedCount')::int, 0) > 0) AS runs_with_promoted,
      COUNT(*) AS total_runs
    FROM job_sourcing_runs
    WHERE status = 'completed' AND meta->'diagnostics' IS NOT NULL
      AND (
        meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' = 'technical_account_manager'
        OR meta->'diagnostics'->'trackDecision'->>'track' = 'blended'
      )
    GROUP BY 1
  ),
  -- Overall top20 precision
  overall_precision AS (
    SELECT
      CASE WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test' ELSE 'baseline' END AS cohort,
      ROUND(
        COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20), 0) * 100
      , 1) AS precision_pct
    FROM job_sourcing_runs rm
    JOIN job_sourced_candidates c ON c.request_id = rm.request_id
    WHERE rm.status = 'completed' AND rm.meta->'diagnostics' IS NOT NULL
    GROUP BY 1
  ),
  -- Unknown location cap check
  unk_cap AS (
    SELECT
      meta->'diagnostics'->'trackDecision'->>'track' AS track,
      MAX((meta->'diagnostics'->>'unknownLocationPromotedCount')::int) AS max_unk,
      CASE
        WHEN meta->'diagnostics'->'trackDecision'->>'track' = 'tech'
             AND MAX((meta->'diagnostics'->>'unknownLocationPromotedCount')::int) > 10 THEN 'FAIL'
        WHEN meta->'diagnostics'->'trackDecision'->>'track' IN ('non_tech','blended')
             AND MAX((meta->'diagnostics'->>'unknownLocationPromotedCount')::int) > 20 THEN 'FAIL'
        ELSE 'PASS'
      END AS cap_result
    FROM job_sourcing_runs
    WHERE status = 'completed'
      AND meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL
    GROUP BY 1
  ),
  -- Tech backend canary
  tech_canary AS (
    SELECT
      CASE WHEN rm.meta->'diagnostics'->>'unknownLocationPromotedCount' IS NOT NULL THEN 'test' ELSE 'baseline' END AS cohort,
      ROUND(
        COUNT(*) FILTER (WHERE c.fit_score >= 50 AND (c.candidate_summary->>'rank')::int <= 20)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE (c.candidate_summary->>'rank')::int <= 20), 0) * 100
      , 1) AS backend_precision
    FROM job_sourcing_runs rm
    JOIN job_sourced_candidates c ON c.request_id = rm.request_id
    WHERE rm.status = 'completed'
      AND rm.meta->'diagnostics'->'trackDecision'->>'track' = 'tech'
      AND rm.meta->'diagnostics'->'trackDecision'->'deterministicSignals'->>'roleFamilySignal' IN ('backend','devops')
    GROUP BY 1
  )
  SELECT
    -- Gate 1: TAM/blended uplift real?
    'TAM_UPLIFT' AS gate,
    (SELECT avg_promoted FROM tam_uplift WHERE cohort = 'baseline') AS baseline_val,
    (SELECT avg_promoted FROM tam_uplift WHERE cohort = 'test') AS test_val,
    CASE
      WHEN (SELECT avg_promoted FROM tam_uplift WHERE cohort = 'test') >
           COALESCE((SELECT avg_promoted FROM tam_uplift WHERE cohort = 'baseline'), 0)
      THEN 'PASS' ELSE 'FAIL'
    END AS result
  UNION ALL
  SELECT
    'TAM_RUNS_WITH_PROMOTED',
    (SELECT runs_with_promoted::numeric FROM tam_uplift WHERE cohort = 'baseline'),
    (SELECT runs_with_promoted::numeric FROM tam_uplift WHERE cohort = 'test'),
    CASE
      WHEN COALESCE((SELECT runs_with_promoted FROM tam_uplift WHERE cohort = 'test'), 0) >
           COALESCE((SELECT runs_with_promoted FROM tam_uplift WHERE cohort = 'baseline'), 0)
      THEN 'PASS' ELSE 'CHECK'
    END
  UNION ALL
  SELECT
    'PRECISION_NO_REGRESSION',
    (SELECT precision_pct FROM overall_precision WHERE cohort = 'baseline'),
    (SELECT precision_pct FROM overall_precision WHERE cohort = 'test'),
    CASE
      WHEN (SELECT precision_pct FROM overall_precision WHERE cohort = 'test') >=
           (SELECT precision_pct FROM overall_precision WHERE cohort = 'baseline') - 5
      THEN 'PASS' ELSE 'FAIL'
    END
  UNION ALL
  SELECT
    'UNK_CAP_TECH',
    10,
    (SELECT max_unk::numeric FROM unk_cap WHERE track = 'tech'),
    (SELECT cap_result FROM unk_cap WHERE track = 'tech')
  UNION ALL
  SELECT
    'UNK_CAP_NON_TECH',
    20,
    (SELECT MAX(max_unk)::numeric FROM unk_cap WHERE track IN ('non_tech','blended')),
    (SELECT CASE WHEN MAX(max_unk) > 20 THEN 'FAIL' ELSE 'PASS' END FROM unk_cap WHERE track IN ('non_tech','blended'))
  UNION ALL
  SELECT
    'TECH_CANARY_NO_REGRESSION',
    (SELECT backend_precision FROM tech_canary WHERE cohort = 'baseline'),
    (SELECT backend_precision FROM tech_canary WHERE cohort = 'test'),
    CASE
      WHEN COALESCE((SELECT backend_precision FROM tech_canary WHERE cohort = 'test'), 0) >=
           COALESCE((SELECT backend_precision FROM tech_canary WHERE cohort = 'baseline'), 0) - 5
      THEN 'PASS' ELSE 'FAIL'
    END
) t;
