# UX/Workflow Gaps Audit

**Date:** 2026-02-10
**Scope:** VantaHire Recruiter & Candidate Experience
**Total Issues Identified:** 44

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Priority Issues](#high-priority-issues)
3. [Consistency Issues](#consistency-issues)
4. [AI UX Issues](#ai-ux-issues)
5. [Quick Wins](#quick-wins)
6. [Settings & Configuration Gaps](#settings--configuration-gaps)
7. [Onboarding & First-Time UX](#onboarding--first-time-ux)
8. [Email & Notification Gaps](#email--notification-gaps)
9. [Summary](#summary)
10. [Recommended Fix Order](#recommended-fix-order)

---

## Critical Issues

These issues break core functionality or violate user expectations. Fix first.

### 1. Action checklist links lead to 404s or unfiltered pages

**Severity:** Critical | **Effort:** Medium

**Problem:**
Action items in the recruiter dashboard generate links that either don't exist or aren't handled by the target page.

**Evidence:**
- `pipeline-rules.ts` generates links:
  - `/applications/${id}` - **No route exists** in `App.tsx`
  - `/applications?status=shortlisted&noInterview=true`
  - `/applications?needsUpdate=true`
  - `/applications?stage=…&stale=true`
- `applications-page.tsx:69-75` only reads the `stage` param, ignoring `status`, `noInterview`, `needsUpdate`, `stale`

**Impact:**
Recruiters click recommended actions and land on unfiltered or 404 pages, eroding trust in AI recommendations.

**Fix:**
1. Add `/applications/:id` route that opens application detail modal
2. Parse all query params in `applications-page.tsx`: `status`, `noInterview`, `needsUpdate`, `stale`, `email`
3. Update filter UI to reflect active URL params
4. Or: Change links in `pipeline-rules.ts` to use existing job-scoped pages

**Files:**
- `client/src/lib/pipeline-rules.ts`
- `client/src/App.tsx`
- `client/src/pages/applications-page.tsx`

---

### 2. Compensation visibility toggle missing (UI promises it)

**Severity:** Critical | **Effort:** Small

**Problem:**
The job posting form promises salary privacy control but provides no toggle.

**Evidence:**
- `JobPostingStepper.tsx` Step 2 text: *"Providing salary range helps attract candidates with matching expectations. This remains private unless you choose to share it."*
- No `showCompensation` or `salaryVisible` field exists in `schema.ts`
- `job-details-page.tsx` always displays salary if `salaryMin` or `salaryMax` is set

**Impact:**
Recruiters enter salary expecting privacy control, but candidates always see it.

**Fix:**
1. Add `showCompensationToCandidate: boolean` field to jobs table in `schema.ts`
2. Add toggle in `JobPostingStepper.tsx` Step 2 below salary fields
3. Conditionally render salary in `job-details-page.tsx` based on flag
4. Update job edit page with same toggle

**Files:**
- `shared/schema.ts`
- `client/src/components/JobPostingStepper.tsx`
- `client/src/pages/job-details-page.tsx`
- `client/src/pages/job-edit-page.tsx`

---

### 3. No notification center/inbox

**Severity:** Critical | **Effort:** High

**Problem:**
Users receive notifications via email/WhatsApp but have no way to view notification history in-app.

**Evidence:**
- No notification inbox component exists in codebase
- `notificationService.ts` sends notifications but doesn't store read/unread state for UI
- Only org-level automation toggles exist (8 settings)
- Only 5 email template types defined
- No per-user notification preferences

**Impact:**
Users miss important updates, can't review past notifications, no audit trail.

**Fix:**
1. Create `notifications` table with: id, userId, type, title, body, readAt, createdAt
2. Create notification inbox page/dropdown component
3. Add user-level notification preferences
4. Mark notifications as read when viewed

**Files:**
- `shared/schema.ts` (new table)
- `server/notificationService.ts`
- New: `client/src/components/NotificationInbox.tsx`
- New: `client/src/pages/notification-preferences-page.tsx`

---

### 4. Missing breadcrumbs & lost navigation context

**Severity:** Critical | **Effort:** Medium

**Problem:**
Deep navigation hierarchies lose user context. Most pages lack breadcrumbs and titles.

**Evidence:**
- `Breadcrumb.tsx` has only 2 patterns: `ApplicationBreadcrumb`, `JobPostBreadcrumb`
- 60+ pages lack breadcrumbs entirely
- Deep navigation path (Dashboard → Jobs → Job → Applications → Candidate) has no trail
- No `document.title` updates on most pages

**Impact:**
Users get lost in deep hierarchies, can't navigate back up, browser tabs are indistinguishable.

**Fix:**
1. Create `useBreadcrumb` hook that auto-generates based on route
2. Add breadcrumb to `PageHeader.tsx` as default behavior
3. Implement dynamic `document.title` updates per page
4. Add back navigation for modal-like flows

**Files:**
- `client/src/components/Breadcrumb.tsx`
- `client/src/components/layout/PageHeader.tsx`
- All page components

---

## High Priority Issues

### 5. AI Actions list unbounded, no dismiss/snooze

**Severity:** High | **Effort:** Medium

**Problem:**
Dashboard action checklist can grow indefinitely with no way to dismiss or snooze items.

**Evidence:**
- `PipelineActionChecklist.tsx` renders all items without limit
- AI enhancement capped at 20 in `jobs.routes.ts` but UI doesn't indicate truncation
- State stored in localStorage only via `saveSession/loadSession`
- No `dismissedUntil` or `snoozedAt` fields

**Impact:**
Recruiters with many jobs see overwhelming lists, can't focus on what matters.

**Fix:**
1. Add dismiss/snooze functionality with server-side persistence
2. Add `dismissedUntil`, `dismissReason` fields to action items
3. Show "X more items" when list is truncated
4. Group actions by job for better organization
5. Add priority filter (Urgent only, All, etc.)

**Files:**
- `client/src/components/recruiter/PipelineActionChecklist.tsx`
- `client/src/lib/pipeline-rules.ts`
- `server/jobs.routes.ts`

---

### 6. Action items lack per-item "why" context

**Severity:** High | **Effort:** Small

**Problem:**
Action items show generic titles without explaining why the action is recommended.

**Evidence:**
- `pipeline-rules.ts` stores rich `metadata`: `jobTitle`, `stageName`, `count`, `daysSince`
- `PipelineActionChecklist.tsx` only displays `item.title`, ignores metadata
- AI enhancement adds `description` but it's optional

**Impact:**
Recruiters see "Review 5 candidates stuck in Screening" but don't know which job or why it matters.

**Fix:**
1. Display `metadata.jobTitle` as subtitle
2. Show `metadata.stageName` and `metadata.count` inline
3. Add tooltip with full context
4. Format: "**Job Title** - Review 5 candidates stuck in Screening (7+ days)"

**Files:**
- `client/src/components/recruiter/PipelineActionChecklist.tsx`
- `client/src/lib/pipeline-types.ts`

---

### 7. Clone Settings don't persist

**Severity:** High | **Effort:** Medium-Large

**Problem:**
Job posting Step 4 "Clone Settings" UI suggests templates will be saved, but nothing persists.

**Evidence:**
- `JobPostingStepper.tsx:147` has `cloneFromJobId` state
- Lines 289-292 only `console.log("Recommended templates for job:", selectedTemplateIds)`
- No API call to save template associations
- No schema support for job-template relationships

**Impact:**
Recruiters select templates expecting reuse, but settings are discarded.

**Fix:**
1. Add `jobEmailTemplates` junction table in schema
2. Create API endpoint to associate templates with job
3. Save `selectedTemplateIds` on job creation
4. Pre-select associated templates when sending emails for that job

**Files:**
- `shared/schema.ts`
- `client/src/components/JobPostingStepper.tsx`
- `server/jobs.routes.ts`

---

### 8. Pipeline stages UI conflates job vs org scope

**Severity:** High | **Effort:** Medium-Large

**Problem:**
Editing pipeline stages in a job context modifies org-wide stages without warning.

**Evidence:**
- `job-pipeline-page.tsx` calls `/api/pipeline/stages` (org-wide endpoint)
- All CRUD operations (lines 193-295) affect organization, not job
- No warning that changes affect all jobs
- Pipeline stages are manageable from org settings, but job page implies job-specific control

**Impact:**
Recruiter editing "Sales Rep" job pipeline accidentally changes stages for all jobs.

**Fix:**
1. Add prominent warning: "Pipeline stages are shared across all jobs in your organization"
2. Or: Implement job-specific pipeline stage overrides
3. Link to org settings for global pipeline management
4. Consider read-only view on job pipeline page with "Edit in Settings" button

**Files:**
- `client/src/pages/job-pipeline-page.tsx`
- `server/applications.routes.ts`

---

### 9. Status vs Stage inconsistency causes stale filters

**Severity:** High | **Effort:** Medium

**Problem:**
Applications have both `status` and `currentStage` fields that aren't synchronized.

**Evidence:**
- `schema.ts:139` - `status: text("status").default("submitted")`
- `schema.ts:147` - `currentStage: integer("current_stage")`
- `application-management-page.tsx` Kanban only calls `updateStageMutation`
- `applications-page.tsx` filters and badges use `status`
- Two separate fields, no automatic sync

**Impact:**
Moving candidate on Kanban doesn't update status. Global Applications list shows stale badges.

**Fix:**
1. Option A: Auto-update `status` when `currentStage` changes based on stage type
2. Option B: Deprecate `status` field, derive from stage
3. Option C: Add stage-to-status mapping and sync on stage change
4. Update all filter/badge logic to use consistent source

**Files:**
- `shared/schema.ts`
- `server/applications.routes.ts` (stage update endpoint)
- `client/src/pages/applications-page.tsx`
- `client/src/pages/application-management-page.tsx`

---

### 10. Activity Log noisy and non-collapsible

**Severity:** Medium | **Effort:** Small-Medium

**Problem:**
Job details page shows audit log that clutters daily workflow view.

**Evidence:**
- `job-details-page.tsx:809-864` always renders Activity Log when `auditLog.length > 0`
- Shows raw `entry.changes` metadata
- Hard-coded `auditLog.slice(0, 10)` with no expand option
- No collapse/minimize control

**Impact:**
Compliance-style audit stream in daily workflow view; no way to hide.

**Fix:**
1. Collapse by default with "Show Activity Log" toggle
2. Or: Move to separate "Audit" tab
3. Show only key events (status changes, not all metadata)
4. Add "View all" link to expand beyond 10 items

**Files:**
- `client/src/pages/job-details-page.tsx`

---

### 11. Candidate email filter ignored

**Severity:** Medium | **Effort:** Small

**Problem:**
Clicking a candidate navigates with email param that's ignored.

**Evidence:**
- `candidates-page.tsx:72` - `setLocation(\`/applications?email=\${encodeURIComponent(email)}\`)`
- `applications-page.tsx` useEffect (lines 69-75) only reads `stage` param
- `email` param is silently ignored

**Impact:**
Clicking candidate in Candidates page shows all applications instead of filtering by that candidate.

**Fix:**
1. Add email param parsing in `applications-page.tsx`
2. Pre-populate search field with email value
3. Show active filter chip with clear control

**Files:**
- `client/src/pages/applications-page.tsx`

---

### 12. Interview scheduling lacks timezone

**Severity:** Medium | **Effort:** Medium

**Problem:**
Interview scheduling has no timezone field, causing ambiguity.

**Evidence:**
- `ApplicationDetailPanel.tsx:81-84` collects: `interviewDate`, `interviewTime`, `interviewLocation`, `interviewNotes`
- No timezone field in form or schema
- `.ics` download doesn't include timezone
- Server doesn't store timezone with interview

**Impact:**
Candidates in different timezones get ambiguous interview times.

**Fix:**
1. Add `interviewTimezone` field to applications table
2. Add timezone picker in interview scheduling form
3. Include timezone in .ics file generation
4. Display timezone in all interview time displays

**Files:**
- `shared/schema.ts`
- `client/src/components/kanban/ApplicationDetailPanel.tsx`
- `server/applications.routes.ts`

---

### 13. Unbounded Applications/Candidates lists

**Severity:** Medium | **Effort:** Medium

**Problem:**
List pages render full arrays without pagination.

**Evidence:**
- `applications-page.tsx` renders all applications
- `candidates-page.tsx` renders all candidates
- `/api/my-applications-received` and `/api/candidates` have no `limit`/`offset` params
- No infinite scroll or pagination controls

**Impact:**
Large organizations experience slow page loads and browser performance issues.

**Fix:**
1. Add `limit`, `offset` (or cursor) params to API endpoints
2. Return `{ data, total, hasMore }` metadata
3. Add pagination controls or infinite scroll to UI
4. Consider virtualized lists for very large datasets

**Files:**
- `server/applications.routes.ts`
- `client/src/pages/applications-page.tsx`
- `client/src/pages/candidates-page.tsx`

---

### 14. Phone validation rejects international numbers

**Severity:** Medium | **Effort:** Small

**Problem:**
Phone validation enforces exactly 10 digits, blocking international candidates.

**Evidence:**
- Validation regex: `^\d{10}$`
- No country code selector
- No support for international formats

**Impact:**
Non-US candidates cannot submit applications.

**Fix:**
1. Use international phone validation library (libphonenumber)
2. Add country code selector
3. Or: Relax validation to accept various formats
4. Store in E.164 format

**Files:**
- `client/src/components/recruiter/CandidateIntakeSheet.tsx`
- Validation schemas

---

### 15. Form data lost on close/navigation

**Severity:** Medium | **Effort:** Medium

**Problem:**
Multi-step forms lose all data if user navigates away or closes accidentally.

**Evidence:**
- `CandidateIntakeSheet.tsx` - no auto-save
- `JobPostingStepper.tsx` - no draft functionality
- No "unsaved changes" warning dialog
- No localStorage persistence of form state

**Impact:**
Users lose significant work if they accidentally close tab or navigate away.

**Fix:**
1. Add auto-save to localStorage on field change
2. Add "unsaved changes" confirmation dialog on close/navigate
3. Implement server-side draft storage for job postings
4. Add "Save as Draft" button

**Files:**
- `client/src/components/recruiter/CandidateIntakeSheet.tsx`
- `client/src/components/JobPostingStepper.tsx`

---

### 16. Client-side filtering performance issues

**Severity:** Medium | **Effort:** High

**Problem:**
Large datasets are filtered entirely in JavaScript.

**Evidence:**
- `application-management-page.tsx` filters full array in memory
- `jobs-page.tsx:88-106` comment: "Client-side sorting (server doesn't support sortBy yet)"
- No search input debouncing on most pages
- Admin pages fetch limited data then filter client-side

**Impact:**
Performance degrades significantly with large datasets.

**Fix:**
1. Add server-side filtering, sorting, pagination to all list endpoints
2. Add debounce (300ms) to search inputs
3. Move filter logic to SQL queries
4. Return filtered counts from server

**Files:**
- `server/jobs.routes.ts`
- `server/applications.routes.ts`
- `client/src/pages/application-management-page.tsx`
- `client/src/pages/jobs-page.tsx`

---

### 17. No saved searches or filter presets

**Severity:** Medium | **Effort:** Medium

**Problem:**
Users must re-enter search criteria every session.

**Evidence:**
- No saved search functionality in any list page
- Filters not persisted to URL (except `stage` in applications)
- No "Save this search" option

**Impact:**
Repetitive work for recruiters who regularly use the same filters.

**Fix:**
1. Sync all filters to URL params (shareable links)
2. Add "Save Search" functionality
3. Store saved searches per user
4. Add dropdown to quickly apply saved searches

**Files:**
- All list pages
- New: saved searches table and API

---

### 18. Job deadline does not auto-unpublish job

**Severity:** Medium | **Effort:** Small

**Problem:**
Setting a job application deadline does not automatically deactivate/unpublish the job when the deadline passes. The job remains visible on the job board.

**Evidence:**
- `deadline` field exists in `jobs` table (`shared/schema.ts:66`)
- Application blocking logic in `server/applications.routes.ts:115-117` rejects applications after deadline
- `server/jobScheduler.ts` does NOT check deadline field for auto-deactivation
- The 60-day inactivity auto-close is completely separate from deadline

**Impact:**
Recruiters expect the job to close when the deadline passes, but:
- Job remains publicly visible
- Candidates see expired job and try to apply
- Candidates get confusing error: "The application deadline for this job has passed"

**Fix:**
Add scheduled task in `jobScheduler.ts` to auto-deactivate jobs past deadline:
```typescript
// Run daily: Deactivate jobs past their deadline
cron.schedule('0 4 * * *', async () => {
  const now = new Date();
  await db.update(jobs)
    .set({ isActive: false, deactivatedAt: now, deactivationReason: 'deadline_passed' })
    .where(and(
      eq(jobs.isActive, true),
      lt(jobs.deadline, now)
    ));
});
```

**Files:**
- `server/jobScheduler.ts`
- `shared/schema.ts` (add `deadline_passed` to deactivation reasons if enum)

---

## Consistency Issues

### C1. Job description word-count enforced on create, not edit

**Evidence:**
- `JobPostingStepper.tsx` has 200-word minimum with SEO warning
- `job-edit-page.tsx:142-160` `handleSubmit` has no word count validation

**Fix:** Add same validation to job edit page.

---

### C2. URL query handling inconsistent across pages

**Evidence:**
- `applications-page.tsx` reads only `stage`
- `candidates-page.tsx` sends `email`
- Neither handles `status`, `noInterview`, `needsUpdate`, `stale`

**Fix:** Standardize URL param handling across all list pages.

---

### C3. Status vs Stage used interchangeably

**Evidence:**
- `applications-page.tsx` filters/badges on `status`
- `application-management-page.tsx` Kanban uses `currentStage`
- Two separate fields with no sync

**Fix:** Choose one source of truth, derive the other.

---

### C4. Inconsistent terminology

**Examples:**
- "Skills" vs "Specializations"
- "Seats" vs "Members"
- "Plan" vs "Subscription Plan"

**Fix:** Create terminology glossary and standardize across UI.

---

### C5. Inconsistent form validation patterns

**Evidence:**
- Different approaches: Zod schemas, manual validation, react-hook-form
- Errors shown in toast only, not inline with fields
- No real-time validation on blur

**Fix:** Standardize on Zod + react-hook-form with inline errors.

---

## AI UX Issues

### A1. No per-item "why" explanations

**Evidence:**
`PipelineActionChecklist.tsx` shows generic titles. `ActionItem.metadata` with job/stage context exists but isn't displayed.

**Fix:** Display metadata inline with each action item.

---

### A2. No global AI toggle or dismiss for dashboard actions

**Evidence:**
`AISummaryPanel.tsx` has confirm dialog (good). `PipelineActionChecklist.tsx` has no dismiss/snooze control.

**Fix:** Add dismiss button per item, snooze option, and global AI toggle in settings.

---

### A3. AI enhancement silently capped at 20 items

**Evidence:**
`jobs.routes.ts` caps at 20 items. `BulkActionBar.tsx` shows 50-candidate limit warning (good). Dashboard gives no indication of truncation.

**Fix:** Show "Showing 20 of X items" message when truncated.

---

### A4. Resume extraction fails silently

**Evidence:**
`try/catch` in application submission logs error but application succeeds. Candidate not notified. AI matching fails silently.

**Fix:** Store extraction status, notify candidate if resume couldn't be parsed, show warning to recruiter.

---

## Quick Wins

Low effort, high value improvements.

| # | Issue | Fix | File | Effort |
|---|-------|-----|------|--------|
| Q1 | No "Open Job Pipeline" link in Applications rows | Add link to `/jobs/${jobId}/pipeline` | `applications-page.tsx` | S |
| Q2 | No "Clear all filters" button | Add clear button to filter bars | `applications-page.tsx`, `application-management-page.tsx` | S |
| Q3 | Job/stage context hidden in checklist | Display `metadata.jobTitle`, `stageName` | `PipelineActionChecklist.tsx` | S |
| Q4 | Activity Log has hard limit, no expand | Add collapsible with "View all" | `job-details-page.tsx` | S |
| Q5 | Filters not synced to URL | Add URL param sync for shareable views | All list pages | S-M |
| Q6 | No character counts on long inputs | Add counters to textareas | `job-edit-page.tsx`, form components | S |

---

## Settings & Configuration Gaps

### S1. Pipeline stage scope warning missing

**Problem:** Stages editable outside job posting but no warning that changes affect all jobs.

**Fix:** Add prominent warning banner.

---

### S2. No user notification preferences

**Problem:** Only org-level toggles exist. No per-user control.

**Fix:** Add user notification preferences page.

---

### S3. Missing common settings

**Missing:**
- Timezone preference
- Language preference
- Two-factor authentication
- "View my public profile" preview

---

### S4. Team settings scattered

**Problem:** `/org/settings`, `/org/team`, `/org/billing` are separate pages with no breadcrumb showing hierarchy.

**Fix:** Add org settings sidebar or breadcrumb navigation.

---

### S5. Feature explanations missing in admin

**Problem:** Admin override fields, credit limits, feature categories have no descriptions.

**Fix:** Add tooltips and help text to admin controls.

---

## Onboarding & First-Time UX

### O1. Tours may not auto-trigger for new users

**Note:** `TourProvider`, `TourLauncher`, `tour-config.ts` exist.

**Verify:** Check if tours launch automatically on first login or require manual trigger.

**Fix if needed:** Auto-trigger onboarding tour for new users.

---

### O2. Locked form sections unexplained

**Problem:** `CandidateIntakeSheet.tsx` locks sections 2-6 until Contact complete. Lock icon shown but no tooltip explaining why.

**Fix:** Add tooltip: "Complete Contact section first to unlock"

---

### O3. Plan selection lacks detail

**Problem:** No comparison table, no feature breakdown, no guidance on choosing plan.

**Fix:** Add feature comparison matrix and recommended plan guidance.

---

## Email & Notification Gaps

### E1. Limited transactional email types

**Current:** 5 email template types

**Missing:**
- Interview cancellation/reschedule
- Offer accepted/declined notification
- Bulk action notifications
- Assessment/form request reminders

---

### E2. Mixed template systems

**Problem:** Django templates in `/common/templates/mails/` + DB templates in `emailTemplates` table

**Fix:** Migrate all to database-driven templates.

---

### E3. No email unsubscribe links

**Problem:** Transactional emails don't include unsubscribe option.

**Fix:** Add unsubscribe links for compliance (CAN-SPAM, GDPR).

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| Critical | 4 | Broken links, missing promised features, no notification center, lost navigation |
| High | 14 | AI issues, data sync, performance, missing features, deadline behavior |
| Consistency | 5 | Validation, terminology, query handling |
| AI UX | 4 | Explainability, control, bounds |
| Quick Wins | 6 | Small fixes, high value |
| Settings | 5 | Missing configuration options |
| Onboarding | 3 | First-time experience gaps |
| Email | 3 | Notification gaps |
| **TOTAL** | **44** | |

---

## Recommended Fix Order

### Phase 1: Quick Wins (2-3 days)

- [ ] Q3: Show job/stage metadata in action checklist
- [ ] Q2: Add "Clear all filters" button
- [ ] Q4: Activity Log expand/collapse
- [ ] Q1: Add "Open Job Pipeline" link
- [ ] C1: Add word count validation to job edit
- [ ] #14: Fix phone validation for international

### Phase 2: Critical Fixes (1 week)

- [ ] #1: Implement missing URL params in applications-page
- [ ] #2: Add compensation visibility toggle
- [ ] #11: Parse email param in applications-page
- [ ] #6: Display action item metadata (why)
- [ ] #10: Make Activity Log collapsible by default
- [ ] #8: Add warning when editing org-wide pipeline stages

### Phase 3: High Priority (2 weeks)

- [ ] #9: Sync status when stage changes
- [ ] #5: Server-side checklist with dismiss/snooze
- [ ] #12: Add timezone to interview scheduling
- [ ] #13: Add pagination to applications/candidates

### Phase 4: Architecture (3+ weeks)

- [ ] #7: Persist clone settings via API
- [ ] #3: Build notification center
- [ ] #16: Server-side filtering/sorting
- [ ] #17: Saved searches feature

---

## Appendix: File Reference

### Most Affected Files

| File | Issues |
|------|--------|
| `client/src/pages/applications-page.tsx` | #1, #11, C2, Q1, Q2 |
| `client/src/components/recruiter/PipelineActionChecklist.tsx` | #5, #6, A1, A2, Q3 |
| `client/src/lib/pipeline-rules.ts` | #1, #6 |
| `client/src/components/JobPostingStepper.tsx` | #2, #7, #15 |
| `client/src/pages/job-details-page.tsx` | #2, #10, Q4 |
| `client/src/pages/job-pipeline-page.tsx` | #8 |
| `shared/schema.ts` | #2, #3, #9, #12 |
| `server/applications.routes.ts` | #9, #12, #13 |
| `server/jobs.routes.ts` | #5, #7, A3 |

---

*Generated by UX Audit - VantaHire*
