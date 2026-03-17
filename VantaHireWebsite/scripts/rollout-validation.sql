-- =============================================================================
-- VANTA UI OVERHAUL — 50-JOB ROLLOUT VALIDATION
-- Run against Vanta DB (ballast.proxy.rlwy.net:57998)
-- =============================================================================

-- ============================================================
-- SECTION 0: BEFORE-RUN — Job Mix Verification
-- ============================================================

-- 0a. Role category classification
WITH job_roles AS (
  SELECT DISTINCT ON (j.id)
    j.id as job_id,
    j.title,
    j.location,
    CASE
      WHEN j.title ~* '(engineer|developer|devops|sre|platform|backend|frontend|full.?stack|data engineer|ml engineer|qa)'
        THEN 'tech'
      WHEN j.title ~* '(account.?exec|sales|bdr|business.?dev|regional.?sales|product.?market)'
        THEN 'non_tech'
      WHEN j.title ~* '(tam|technical.?account|solutions.?engineer|customer.?success|csm)'
        THEN 'blended'
      ELSE 'other'
    END as role_category,
    CASE
      WHEN j.location ~* 'india|bangalore|mumbai|delhi|hyderabad|pune|chennai' THEN 'India'
      WHEN j.location ~* 'remote' THEN 'Remote'
      WHEN j.location ~* 'san.francisco|seattle|austin|boston|chicago|new.york' THEN 'US'
      ELSE 'Other'
    END as geo
  FROM jobs j
  JOIN job_sourcing_runs r ON r.job_id = j.id AND r.status = 'completed'
)
SELECT
  role_category,
  geo,
  count(*) as job_count,
  array_agg(DISTINCT title ORDER BY title) as sample_titles
FROM job_roles
GROUP BY role_category, geo
ORDER BY role_category, geo;

-- 0b. Gate: Ensure mix (manual check)
-- Requirement: tech >= 10, non_tech >= 5, blended >= 5, geos >= 2

-- ============================================================
-- SECTION 1: PER-JOB METRICS (latest completed run per job)
-- ============================================================

WITH latest_runs AS (
  SELECT DISTINCT ON (r.job_id)
    r.job_id,
    r.id as run_id,
    r.request_id,
    r.submitted_at,
    r.completed_at,
    r.meta
  FROM job_sourcing_runs r
  WHERE r.status = 'completed'
  ORDER BY r.job_id, r.created_at DESC
),
candidates AS (
  SELECT
    c.job_id,
    c.fit_score,
    c.fit_breakdown,
    c.source_type,
    c.state,
    c.candidate_summary->>'matchTier' as match_tier,
    c.candidate_summary->>'locationMatchType' as location_match_type,
    c.candidate_summary->>'enrichmentStatus' as enrichment_status,
    c.candidate_summary->>'locationLabel' as location_label,
    c.candidate_summary->>'professionalValidation' IS NOT NULL
      AND c.candidate_summary->>'professionalValidation' != 'null' as has_prof_validation,
    c.candidate_summary->>'locationConfidence' as location_confidence_numeric,
    (c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float as identity_confidence,
    (c.candidate_summary->>'rank')::int as signal_rank
  FROM job_sourced_candidates c
  JOIN latest_runs lr ON lr.request_id = c.request_id
),
-- Engagement-ready computation (mirrors server isEngagementReady)
engagement AS (
  SELECT
    c.*,
    CASE
      WHEN COALESCE(c.fit_score, 0) >= 55
        AND (c.location_match_type IN ('city_exact', 'city_alias', 'country_only'))
        AND c.enrichment_status != 'pending'
        AND (c.identity_confidence IS NULL OR c.identity_confidence >= 0.5)
      THEN true
      ELSE false
    END as engagement_ready
  FROM candidates c
),
per_job AS (
  SELECT
    j.id as job_id,
    j.title,
    j.location,
    CASE
      WHEN j.title ~* '(engineer|developer|devops|sre|platform|backend|frontend|full.?stack|data engineer|ml engineer|qa)'
        THEN 'tech'
      WHEN j.title ~* '(account.?exec|sales|bdr|business.?dev|regional.?sales|product.?market)'
        THEN 'non_tech'
      WHEN j.title ~* '(tam|technical.?account|solutions.?engineer|customer.?success|csm)'
        THEN 'blended'
      ELSE 'other'
    END as role_category,

    -- Candidate counts
    count(*) as total_candidates,

    -- Top-20 analysis
    count(*) FILTER (WHERE e.signal_rank <= 20) as top20_count,

    -- Engagement-ready metrics
    count(*) FILTER (WHERE e.engagement_ready) as engagement_ready_count,
    min(e.signal_rank) FILTER (WHERE e.engagement_ready) as first_qualified_candidate_rank,

    -- Location match distribution
    count(*) FILTER (WHERE e.location_match_type = 'city_exact') as loc_city_exact,
    count(*) FILTER (WHERE e.location_match_type = 'city_alias') as loc_city_alias,
    count(*) FILTER (WHERE e.location_match_type = 'country_only') as loc_country_only,
    count(*) FILTER (WHERE e.location_match_type = 'unknown_location') as loc_unknown,
    count(*) FILTER (WHERE e.location_match_type = 'none') as loc_none,
    count(*) FILTER (WHERE e.location_match_type IS NULL) as loc_null,

    -- Source type distribution
    count(*) FILTER (WHERE e.source_type = 'pool_enriched') as src_pool_enriched,
    count(*) FILTER (WHERE e.source_type = 'pool') as src_pool,
    count(*) FILTER (WHERE e.source_type = 'discovered') as src_discovered,

    -- Match tier
    count(*) FILTER (WHERE e.match_tier = 'best_matches') as tier_best,
    count(*) FILTER (WHERE e.match_tier = 'broader_pool') as tier_broader,

    -- Discovered promoted (from meta)
    (lr.meta->'groupCounts'->>'discoveredPromotedCount')::int as discovered_promoted_count,

    -- unknown_location share
    ROUND(
      count(*) FILTER (WHERE e.location_match_type = 'unknown_location')::numeric /
      NULLIF(count(*), 0) * 100, 1
    ) as unknown_location_pct,

    -- New contract fields presence
    count(*) FILTER (WHERE e.location_label IS NOT NULL AND e.location_label != '') as has_location_label,
    count(*) FILTER (WHERE e.has_prof_validation) as has_prof_validation,

    -- Time to first engagement ready (seconds)
    EXTRACT(EPOCH FROM (lr.completed_at - lr.submitted_at)) as run_duration_secs

  FROM engagement e
  JOIN jobs j ON j.id = e.job_id
  JOIN latest_runs lr ON lr.job_id = j.id
  GROUP BY j.id, j.title, j.location, lr.meta, lr.completed_at, lr.submitted_at
  ORDER BY j.id
)
SELECT * FROM per_job;

-- ============================================================
-- SECTION 2: AGGREGATE GATES (Go/No-Go)
-- ============================================================

WITH latest_runs AS (
  SELECT DISTINCT ON (r.job_id)
    r.job_id, r.id as run_id, r.request_id, r.submitted_at, r.completed_at, r.meta
  FROM job_sourcing_runs r
  WHERE r.status = 'completed'
  ORDER BY r.job_id, r.created_at DESC
),
candidates AS (
  SELECT
    c.job_id,
    c.fit_score,
    c.source_type,
    c.candidate_summary->>'matchTier' as match_tier,
    c.candidate_summary->>'locationMatchType' as location_match_type,
    c.candidate_summary->>'enrichmentStatus' as enrichment_status,
    (c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float as identity_confidence,
    (c.candidate_summary->>'rank')::int as signal_rank
  FROM job_sourced_candidates c
  JOIN latest_runs lr ON lr.request_id = c.request_id
),
engagement AS (
  SELECT
    c.*,
    CASE
      WHEN COALESCE(c.fit_score, 0) >= 55
        AND (c.location_match_type IN ('city_exact', 'city_alias', 'country_only'))
        AND c.enrichment_status != 'pending'
        AND (c.identity_confidence IS NULL OR c.identity_confidence >= 0.5)
      THEN true
      ELSE false
    END as engagement_ready
  FROM candidates c
),
per_job_agg AS (
  SELECT
    j.id as job_id,
    j.title,
    CASE
      WHEN j.title ~* '(engineer|developer|devops|sre|platform|backend|frontend|full.?stack|data engineer|ml engineer|qa)'
        THEN 'tech'
      WHEN j.title ~* '(account.?exec|sales|bdr|business.?dev|regional.?sales|product.?market)'
        THEN 'non_tech'
      WHEN j.title ~* '(tam|technical.?account|solutions.?engineer|customer.?success|csm)'
        THEN 'blended'
      ELSE 'other'
    END as role_category,
    count(*) as total,
    count(*) FILTER (WHERE e.engagement_ready) as engagement_ready_count,
    min(e.signal_rank) FILTER (WHERE e.engagement_ready) as first_qualified_rank,
    ROUND(count(*) FILTER (WHERE e.location_match_type = 'unknown_location')::numeric / NULLIF(count(*), 0) * 100, 1) as unknown_location_pct,
    EXTRACT(EPOCH FROM (lr.completed_at - lr.submitted_at)) as run_duration_secs
  FROM engagement e
  JOIN jobs j ON j.id = e.job_id
  JOIN latest_runs lr ON lr.job_id = j.id
  GROUP BY j.id, j.title, lr.completed_at, lr.submitted_at
)
SELECT
  '--- AGGREGATE GATES ---' as section,
  '' as metric,
  '' as value,
  '' as gate
UNION ALL
SELECT
  'engagement_ready',
  'Jobs with >= 1 engagement-ready',
  count(*) FILTER (WHERE engagement_ready_count > 0)::text || ' / ' || count(*)::text,
  CASE WHEN count(*) FILTER (WHERE engagement_ready_count > 0)::float / NULLIF(count(*), 0) >= 0.5 THEN 'PASS' ELSE 'FAIL' END
FROM per_job_agg
UNION ALL
SELECT
  'first_qualified_rank',
  'Median first qualified rank',
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY first_qualified_rank)::text,
  CASE WHEN PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY first_qualified_rank) <= 15 THEN 'PASS' ELSE 'WARN' END
FROM per_job_agg WHERE first_qualified_rank IS NOT NULL
UNION ALL
SELECT
  'first_qualified_rank_p90',
  'P90 first qualified rank',
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY first_qualified_rank)::text,
  CASE WHEN PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY first_qualified_rank) <= 30 THEN 'PASS' ELSE 'WARN' END
FROM per_job_agg WHERE first_qualified_rank IS NOT NULL
UNION ALL
SELECT
  'unknown_location_share',
  'Average unknown_location %',
  ROUND(AVG(unknown_location_pct), 1)::text || '%',
  CASE WHEN AVG(unknown_location_pct) <= 80 THEN 'PASS' ELSE 'FAIL' END
FROM per_job_agg
UNION ALL
SELECT
  'time_to_complete_p50',
  'Run duration p50 (seconds)',
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_secs)::numeric, 1)::text,
  CASE WHEN PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_secs) <= 120 THEN 'PASS' ELSE 'WARN' END
FROM per_job_agg
UNION ALL
SELECT
  'time_to_complete_p90',
  'Run duration p90 (seconds)',
  ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_secs)::numeric, 1)::text,
  CASE WHEN PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_secs) <= 300 THEN 'PASS' ELSE 'WARN' END
FROM per_job_agg;

-- ============================================================
-- SECTION 3: AGGREGATE BY ROLE CATEGORY (cohort regression check)
-- ============================================================

WITH latest_runs AS (
  SELECT DISTINCT ON (r.job_id)
    r.job_id, r.request_id, r.submitted_at, r.completed_at
  FROM job_sourcing_runs r
  WHERE r.status = 'completed'
  ORDER BY r.job_id, r.created_at DESC
),
candidates AS (
  SELECT
    c.job_id,
    c.fit_score,
    c.candidate_summary->>'locationMatchType' as location_match_type,
    c.candidate_summary->>'enrichmentStatus' as enrichment_status,
    c.candidate_summary->>'matchTier' as match_tier,
    (c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float as identity_confidence,
    (c.candidate_summary->>'rank')::int as signal_rank
  FROM job_sourced_candidates c
  JOIN latest_runs lr ON lr.request_id = c.request_id
),
engagement AS (
  SELECT c.*,
    CASE
      WHEN COALESCE(c.fit_score, 0) >= 55
        AND (c.location_match_type IN ('city_exact', 'city_alias', 'country_only'))
        AND c.enrichment_status != 'pending'
        AND (c.identity_confidence IS NULL OR c.identity_confidence >= 0.5)
      THEN true ELSE false
    END as engagement_ready
  FROM candidates c
)
SELECT
  CASE
    WHEN j.title ~* '(engineer|developer|devops|sre|platform|backend|frontend|full.?stack|data engineer|ml engineer|qa)'
      THEN 'tech'
    WHEN j.title ~* '(account.?exec|sales|bdr|business.?dev|regional.?sales|product.?market)'
      THEN 'non_tech'
    WHEN j.title ~* '(tam|technical.?account|solutions.?engineer|customer.?success|csm)'
      THEN 'blended'
    ELSE 'other'
  END as cohort,
  count(DISTINCT j.id) as jobs,
  count(*) as total_candidates,
  ROUND(AVG(e.fit_score), 1) as avg_fit,
  ROUND(count(*) FILTER (WHERE e.engagement_ready)::numeric / NULLIF(count(*), 0) * 100, 1) as engagement_ready_pct,
  ROUND(count(*) FILTER (WHERE e.location_match_type = 'unknown_location')::numeric / NULLIF(count(*), 0) * 100, 1) as unknown_loc_pct,
  ROUND(count(*) FILTER (WHERE e.match_tier = 'best_matches')::numeric / NULLIF(count(*), 0) * 100, 1) as best_matches_pct,
  ROUND(AVG(CASE WHEN e.signal_rank <= 20 THEN e.fit_score END), 1) as avg_top20_fit
FROM engagement e
JOIN jobs j ON j.id = e.job_id
GROUP BY cohort
ORDER BY cohort;

-- ============================================================
-- SECTION 4: UI/DATA CONTRACT CHECKS
-- ============================================================

-- 4a. unknown_location appears correctly (not dropped to null)
SELECT
  'unknown_location_not_dropped' as check_name,
  count(*) FILTER (WHERE c.candidate_summary->>'locationMatchType' = 'unknown_location') as unknown_location_count,
  count(*) FILTER (WHERE c.candidate_summary->>'locationMatchType' IS NULL) as null_location_type_count,
  count(*) as total,
  CASE
    WHEN count(*) FILTER (WHERE c.candidate_summary->>'locationMatchType' = 'unknown_location') > 0
    THEN 'PASS'
    ELSE 'CHECK — unknown_location may not be in data yet (pre-resync)'
  END as gate
FROM job_sourced_candidates c;

-- 4b. locationLabel and professionalValidation presence
SELECT
  'new_fields_presence' as check_name,
  count(*) FILTER (WHERE c.candidate_summary->>'locationLabel' IS NOT NULL AND c.candidate_summary->>'locationLabel' != '') as has_location_label,
  count(*) FILTER (WHERE c.candidate_summary->>'professionalValidation' IS NOT NULL AND c.candidate_summary->>'professionalValidation' != 'null') as has_prof_validation,
  count(*) as total,
  'NOTE: These fields only appear after re-sync with updated sourcing-sync.ts' as note
FROM job_sourced_candidates c;

-- 4c. engagementReady consistency with thresholds
-- Simulate what flattenCandidateForUI would compute
WITH er_check AS (
  SELECT
    c.id,
    c.fit_score,
    c.candidate_summary->>'locationMatchType' as loc_type,
    c.candidate_summary->>'enrichmentStatus' as enrich_status,
    (c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float as id_conf,
    CASE
      WHEN COALESCE(c.fit_score, 0) >= 55
        AND (c.candidate_summary->>'locationMatchType' IN ('city_exact', 'city_alias', 'country_only'))
        AND c.candidate_summary->>'enrichmentStatus' != 'pending'
        AND ((c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float IS NULL
          OR (c.candidate_summary->'identitySummary'->>'maxIdentityConfidence')::float >= 0.5)
      THEN true ELSE false
    END as expected_engagement_ready
  FROM job_sourced_candidates c
)
SELECT
  'engagement_ready_consistency' as check_name,
  count(*) FILTER (WHERE expected_engagement_ready) as would_be_engagement_ready,
  count(*) as total,
  ROUND(count(*) FILTER (WHERE expected_engagement_ready)::numeric / NULLIF(count(*), 0) * 100, 1) as engagement_ready_pct,
  'This should match API engagementReadyCount after deploy' as note
FROM er_check;

-- 4d. Fit score scale check (should be 0-100 in DB)
SELECT
  'fit_score_scale' as check_name,
  min(fit_score) as min_fit,
  max(fit_score) as max_fit,
  ROUND(avg(fit_score), 1) as avg_fit,
  count(*) FILTER (WHERE fit_score BETWEEN 0 AND 100) as in_range,
  count(*) FILTER (WHERE fit_score < 0 OR fit_score > 100) as out_of_range,
  CASE WHEN count(*) FILTER (WHERE fit_score < 0 OR fit_score > 100) = 0 THEN 'PASS' ELSE 'FAIL' END as gate
FROM job_sourced_candidates
WHERE fit_score IS NOT NULL;

-- 4e. Location match type distribution across ALL candidates
SELECT
  c.candidate_summary->>'locationMatchType' as location_match_type,
  count(*) as count,
  ROUND(count(*)::numeric / (SELECT count(*) FROM job_sourced_candidates) * 100, 1) as pct
FROM job_sourced_candidates c
GROUP BY c.candidate_summary->>'locationMatchType'
ORDER BY count DESC;

-- 4f. firstEngagementReadySeenAt in meta (after deploy)
SELECT
  'first_engagement_ready_meta' as check_name,
  count(*) FILTER (WHERE r.meta->>'firstEngagementReadySeenAt' IS NOT NULL) as has_timestamp,
  count(*) as total_runs,
  'Will be 0 pre-deploy, should grow post-deploy' as note
FROM job_sourcing_runs r
WHERE r.status = 'completed';
