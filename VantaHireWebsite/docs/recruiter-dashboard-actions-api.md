# Recruiter Dashboard Actions API

This dashboard is recruiter-scoped for every user, including org owners and admins.

## Endpoint

`GET /api/recruiter-dashboard/actions`

## Scope

- Returns actions only for jobs the current recruiter owns or is assigned to.
- Does not return org-level analytics.
- Same payload shape for owner, admin, recruiter, and super admin when using this dashboard.

## Response shape

```json
{
  "generatedAt": "2026-03-20T12:00:00.000Z",
  "viewer": {
    "role": "recruiter",
    "organizationId": 6,
    "organizationRole": "member",
    "dashboardScope": "recruiter"
  },
  "sections": [
    {
      "id": "candidatesToReview",
      "title": "Candidates to Review",
      "description": "Fresh applicants and unreviewed candidates on active jobs.",
      "count": 4,
      "emptyMessage": "No candidates waiting for first review.",
      "viewAllHref": "/applications?status=submitted",
      "items": [
        {
          "id": "review-1821",
          "type": "candidate_review",
          "title": "Review Priya Sharma",
          "subtitle": "Senior Backend Engineer · Waiting 2d · Strong fit",
          "urgency": "high",
          "ctaLabel": "Open Candidate",
          "ctaHref": "/jobs/44/applications?stage=7&applicationId=1821",
          "jobId": 44,
          "applicationId": 1821,
          "badge": "Strong"
        }
      ]
    }
  ]
}
```

## Section order

Always render in this order:

1. `candidatesToReview`
2. `feedbackPending`
3. `finalStageCandidates`
4. `jobsLowOnPipeline`

## Item fields

- `id`: stable card id
- `type`: item category
- `title`: primary line
- `subtitle`: short context line
- `urgency`: `high | medium | low`
- `ctaLabel`: button text
- `ctaHref`: backend-owned destination
- `jobId`: related job id when relevant
- `applicationId`: related application id when relevant
- `badge`: optional short tag

## CTA behavior

Frontend should treat `ctaHref` as the source of truth.

- Candidate CTAs now deep-link to `/jobs/:id/applications`
- The URL includes `applicationId`
- The job applications page now auto-opens that candidate detail modal when `applicationId` is present
- Some links also include `stage` so the correct column/filter is already selected

Frontend should not rebuild or infer these links.

## Rendering notes

- Show max 4 items per section on the dashboard
- If `count > items.length`, show a `View all` button using `viewAllHref`
- If `items.length === 0`, render the section `emptyMessage`
- `generatedAt` can be shown as a lightweight “Updated” timestamp

## Current backend rules

- `Candidates to Review`: submitted or unreviewed candidates on active jobs
- `Feedback Pending`: HM/client decision blockers waiting past the threshold
- `Final Stage Candidates`: offer or final-stage candidates needing closure
- `Jobs Low on Pipeline`: active roles with thin candidate depth
