# VantaHire ATS Integration Plan
## Lightweight Applicant Tracking System Integration

**Goal**: Add core ATS features to VantaHire while keeping the implementation simple and focused.

> Historical note: this plan originally used the legacy SpotAxis service as a reference. That service has since been removed from this repo, so the SpotAxis-specific file paths below are archival context only.

---

## 📋 Requirements Summary

Based on user needs, we'll implement:

1. ✅ **Recruiter Login** - Already exists (role-based auth)
2. ✅ **Job Posting** - Already exists
3. ✅ **Applicant Applications** - Already exists (applications table)
4. 🆕 **Application Pipeline** - Move candidates through stages
5. 🆕 **Email Scheduling** - Send interview invitations and updates
6. 🆕 **Interview Scheduling** - Track interview dates/times
7. 🆕 **Resume Management** - Better organization and notes

---

## 🏗️ Architecture Analysis

### Current VantaHire Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Passport.js (local strategy)
- **Email**: Nodemailer + SendGrid
- **File Storage**: Cloudinary

### Current Schema (Already Built)
```typescript
users {
  id, username, password, firstName, lastName
  role: "admin" | "recruiter" | "candidate"  ✅
}

jobs {
  id, title, location, type, description, skills
  postedBy → users.id  ✅
  status: 'pending' | 'approved' | 'declined'
  isActive, deadline, createdAt
}

applications {
  id, jobId → jobs.id  ✅
  name, email, phone, resumeUrl, coverLetter
  status: "submitted" | "reviewed" | "shortlisted" | "rejected" | "downloaded"
  notes, appliedAt, updatedAt
  lastViewedAt, downloadedAt  ✅
}
```

### What's Missing (To Add)

1. **Pipeline Stages** - Custom hiring stages per company
2. **Interview Scheduling** - Date/time tracking
3. **Email Templates** - Standardized communications
4. **Stage History** - Track candidate movement
5. **Recruiter Notes** - Internal comments on candidates

---

## 🎯 Implementation Plan

### Phase 1: Database Schema Extensions (2-3 hours)

#### 1.1 Add Pipeline Stages Table
```typescript
// shared/schema.ts
export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Applied", "Phone Screen", "Interview", "Offer", "Hired"
  order: integer("order").notNull(), // 1, 2, 3, 4, 5
  color: text("color").default("#3b82f6"), // Badge color
  isDefault: boolean("is_default").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Default Stages** (seed data):
1. Applied (gray)
2. Screening (blue)
3. Interview Scheduled (yellow)
4. Offer Extended (green)
5. Hired (emerald)
6. Rejected (red)

#### 1.2 Extend Applications Table
```typescript
// Modify existing applications table
export const applications = pgTable("applications", {
  // ... existing fields ...
  currentStage: integer("current_stage").references(() => pipelineStages.id),

  // Interview scheduling
  interviewDate: timestamp("interview_date"),
  interviewTime: text("interview_time"), // "10:00 AM - 11:00 AM"
  interviewLocation: text("interview_location"), // "Zoom: https://..." or "Office: Room 201"
  interviewNotes: text("interview_notes"),

  // Internal tracking
  recruiterNotes: text("recruiter_notes").array(), // Array of timestamped notes
  rating: integer("rating"), // 1-5 stars
  tags: text("tags").array(), // ["React", "Senior", "Remote OK"]

  // Activity tracking
  stageChangedAt: timestamp("stage_changed_at"),
  stageChangedBy: integer("stage_changed_by").references(() => users.id),
});
```

#### 1.3 Add Stage History Table
```typescript
export const applicationStageHistory = pgTable("application_stage_history", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => applications.id, { onDelete: 'cascade' }),
  fromStage: integer("from_stage").references(() => pipelineStages.id),
  toStage: integer("to_stage").notNull().references(() => pipelineStages.id),
  changedBy: integer("changed_by").notNull().references(() => users.id),
  notes: text("notes"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});
```

#### 1.4 Add Email Templates Table
```typescript
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Interview Invitation", "Application Received"
  subject: text("subject").notNull(),
  body: text("body").notNull(), // Supports {{candidate_name}}, {{job_title}}, {{interview_date}}
  templateType: text("template_type").notNull(), // "interview_invite", "status_update", "rejection"
  createdBy: integer("created_by").references(() => users.id),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Default Email Templates** (seed data):
```javascript
{
  name: "Interview Invitation",
  subject: "Interview Invitation - {{job_title}} at VantaHire",
  body: `Hi {{candidate_name}},

We're impressed with your application for the {{job_title}} position!

We'd like to invite you for an interview:
📅 Date: {{interview_date}}
🕐 Time: {{interview_time}}
📍 Location: {{interview_location}}

Please confirm your availability by replying to this email.

Best regards,
{{recruiter_name}}
{{company_name}}`
}
```

---

### Phase 2: Backend API Routes (3-4 hours)

#### 2.1 Pipeline Management APIs

**GET /api/pipeline/stages**
- Returns all pipeline stages (ordered)
- For displaying stage columns in Kanban view

**POST /api/pipeline/stages**
- Create custom stage (recruiters only)
- `{ name, order, color }`

**PATCH /api/applications/:id/stage**
- Move application to new stage
- `{ stageId, notes }`
- Records in stage_history
- Triggers notification/email (optional)

#### 2.2 Application Management APIs

**PATCH /api/applications/:id/interview**
- Schedule interview
- `{ date, time, location, notes }`
- Triggers interview invitation email

**POST /api/applications/:id/notes**
- Add recruiter note
- `{ note }`
- Appends to recruiterNotes array with timestamp

**PATCH /api/applications/:id/rating**
- Set candidate rating (1-5 stars)
- `{ rating }`

**GET /api/applications/:id/history**
- Returns stage change history
- Shows who moved candidate and when

#### 2.3 Email Template APIs

**GET /api/email-templates**
- List all templates (grouped by type)

**POST /api/email-templates**
- Create custom template
- `{ name, subject, body, templateType }`

**POST /api/applications/:id/send-email**
- Send email using template
- `{ templateId, customizations: { interview_date, interview_time, interview_location } }`
- Replaces {{variables}} with actual data
- Sends via existing emailService

---

### Phase 3: Frontend UI Components (4-5 hours)

#### 3.1 Recruiter Dashboard Enhancement

**Current**: List view of applications
**New**: Kanban board + enhanced list view

**File**: `client/src/pages/RecruiterDashboard.tsx` (new or modify existing)

```typescript
// Kanban Board View
<PipelineKanban />
  {stages.map(stage => (
    <StageColumn key={stage.id} stage={stage}>
      {applications
        .filter(app => app.currentStage === stage.id)
        .map(app => (
          <ApplicationCard
            application={app}
            onDragToStage={handleStageChange}
            onOpenDetails={handleOpenDetails}
          />
        ))
      }
    </StageColumn>
  ))}
</PipelineKanban>

// List View (enhanced existing)
<ApplicationsList>
  <Filter by={stage, rating, tags} />
  <Sort by={date, name, stage} />
  <ApplicationRow
    showStage={true}
    showRating={true}
    quickActions={["Move Stage", "Schedule Interview", "Add Note"]}
  />
</ApplicationsList>
```

#### 3.2 Application Detail Modal

**File**: `client/src/components/ApplicationDetailModal.tsx` (new)

```typescript
<ApplicationDetailModal application={app}>
  <Tabs>
    <Tab name="Overview">
      <CandidateInfo />
      <ResumeViewer url={app.resumeUrl} />
      <CoverLetter text={app.coverLetter} />
    </Tab>

    <Tab name="Interview">
      <InterviewScheduler
        onSchedule={handleScheduleInterview}
        currentInterview={app.interview}
      />
      <InterviewNotes editable />
    </Tab>

    <Tab name="Notes & Activity">
      <RecruiterNotes
        notes={app.recruiterNotes}
        onAddNote={handleAddNote}
      />
      <StageHistory history={app.stageHistory} />
    </Tab>

    <Tab name="Email">
      <EmailComposer
        templates={emailTemplates}
        candidate={app}
        onSendEmail={handleSendEmail}
      />
    </Tab>
  </Tabs>

  <ActionBar>
    <StageSelector
      currentStage={app.currentStage}
      onChangeStage={handleStageChange}
    />
    <Rating value={app.rating} onChange={handleRating} />
    <Button onClick={downloadResume}>Download Resume</Button>
    <Button onClick={sendEmail}>Send Email</Button>
  </ActionBar>
</ApplicationDetailModal>
```

#### 3.3 Interview Scheduler Component

**File**: `client/src/components/InterviewScheduler.tsx` (new)

```typescript
<InterviewScheduler>
  <DatePicker
    value={interviewDate}
    onChange={setInterviewDate}
    minDate={new Date()}
  />

  <TimePicker
    value={interviewTime}
    onChange={setInterviewTime}
    format="12h"
  />

  <Input
    label="Location"
    placeholder="Zoom link or office location"
    value={interviewLocation}
  />

  <Textarea
    label="Interview Notes"
    placeholder="Topics to cover, interviewers, etc."
    value={interviewNotes}
  />

  <Checkbox
    label="Send interview invitation email"
    checked={sendEmail}
  />

  <Button onClick={handleSchedule}>
    Schedule Interview
  </Button>
</InterviewScheduler>
```

#### 3.4 Email Template Editor

**File**: `client/src/pages/EmailTemplates.tsx` (new - admin/recruiter only)

```typescript
<EmailTemplateManager>
  <TemplateList>
    {templates.map(template => (
      <TemplateCard
        template={template}
        onEdit={handleEdit}
        onPreview={handlePreview}
      />
    ))}
  </TemplateList>

  <TemplateEditor>
    <Input label="Template Name" />
    <Input label="Email Subject" />
    <RichTextEditor
      label="Email Body"
      placeholder="Use {{candidate_name}}, {{job_title}}, {{interview_date}}, etc."
    />
    <VariableHelper>
      Available variables:
      {{candidate_name}}, {{job_title}}, {{interview_date}},
      {{interview_time}}, {{interview_location}},
      {{recruiter_name}}, {{company_name}}
    </VariableHelper>
    <Button onClick={handleSave}>Save Template</Button>
  </TemplateEditor>
</EmailTemplateManager>
```

---

### Phase 4: Email Service Integration (2 hours)

#### 4.1 Template Renderer

**File**: `server/emailTemplateService.ts` (new)

```typescript
export function renderEmailTemplate(
  template: EmailTemplate,
  data: {
    candidate_name: string;
    job_title: string;
    interview_date?: string;
    interview_time?: string;
    interview_location?: string;
    recruiter_name?: string;
    company_name?: string;
  }
): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;

  // Replace all {{variable}} with actual data
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value || '');
    body = body.replace(regex, value || '');
  });

  return { subject, body };
}

export async function sendTemplatedEmail(
  application: Application,
  template: EmailTemplate,
  customData: Record<string, string>
) {
  const data = {
    candidate_name: application.name,
    job_title: application.job.title,
    recruiter_name: application.job.postedBy.firstName + ' ' + application.job.postedBy.lastName,
    company_name: "VantaHire",
    ...customData
  };

  const { subject, body } = renderEmailTemplate(template, data);

  await emailService.sendEmail({
    to: application.email,
    subject,
    text: body,
  });
}
```

#### 4.2 Automated Email Triggers

```typescript
// When interview is scheduled
async function scheduleInterview(applicationId, interviewDetails) {
  // Update application
  await db.update(applications)
    .set({
      interviewDate: interviewDetails.date,
      interviewTime: interviewDetails.time,
      interviewLocation: interviewDetails.location,
    })
    .where(eq(applications.id, applicationId));

  // Send interview invitation email
  const template = await getTemplateByType('interview_invite');
  await sendTemplatedEmail(application, template, {
    interview_date: format(interviewDetails.date, 'MMMM d, yyyy'),
    interview_time: interviewDetails.time,
    interview_location: interviewDetails.location,
  });
}

// When stage changes
async function changeStage(applicationId, newStageId, changedBy, notes) {
  const app = await getApplication(applicationId);
  const oldStageId = app.currentStage;

  // Update application
  await db.update(applications)
    .set({
      currentStage: newStageId,
      stageChangedAt: new Date(),
      stageChangedBy: changedBy,
    })
    .where(eq(applications.id, applicationId));

  // Record history
  await db.insert(applicationStageHistory).values({
    applicationId,
    fromStage: oldStageId,
    toStage: newStageId,
    changedBy,
    notes,
  });

  // Optional: Send status update email
  if (shouldNotifyCandidate(newStageId)) {
    const template = await getTemplateByType('status_update');
    await sendTemplatedEmail(app, template, {
      new_status: getStage(newStageId).name,
    });
  }
}
```

---

### Phase 5: Legacy Reference Mapping

#### Historical Patterns Used During ATS Design

**Legacy reference from `/SpotAxis/companies/models.py`:**
- `Stage` model → Our `pipelineStages` table
- Stage ordering and company-specific stages

**Legacy reference from `/SpotAxis/vacancies/models.py`:**
- `Postulate` model (their application model) → Enhance our `applications`
- Status tracking patterns
- Interview date/location fields

**Legacy reference from `/SpotAxis/activities/models.py`:**
- `Activity` and `Notification` models → Our `applicationStageHistory`
- Email notification triggers
- Timeline/history tracking patterns

**Legacy reference from `/SpotAxis/TRM/templates/` (email templates):**
- Email template structure
- Variable substitution patterns
- Professional email copy

**Legacy reference from `/SpotAxis/vacancies/views.py`:**
- Application status change logic
- Recruiter dashboard filtering
- PDF resume generation (already have resume URLs)

**What NOT to Copy (Too Complex):**
- Multi-company subdomain system
- Payment/subscription system
- Candidate profile builder (we're focused on recruiter side)
- Social OAuth integrations
- Advanced permissions system

---

## 🗂️ File Structure

```
VantaHireWebsite/
├── shared/
│   └── schema.ts (modify - add new tables)
│
├── server/
│   ├── routes.ts (modify - add ATS routes)
│   ├── emailTemplateService.ts (new)
│   ├── pipelineService.ts (new)
│   └── seedDefaultData.ts (new - seed stages & templates)
│
└── client/src/
    ├── pages/
    │   ├── RecruiterDashboard.tsx (modify/new)
    │   └── EmailTemplates.tsx (new)
    │
    └── components/
        ├── PipelineKanban.tsx (new)
        ├── ApplicationDetailModal.tsx (new)
        ├── InterviewScheduler.tsx (new)
        ├── RecruiterNotes.tsx (new)
        ├── StageHistory.tsx (new)
        └── EmailComposer.tsx (new)
```

---

## 📅 Implementation Timeline

| Phase | Task | Time | Dependencies |
|-------|------|------|--------------|
| **1** | Database schema | 2-3h | None |
| **2** | Backend APIs | 3-4h | Phase 1 |
| **3** | Frontend UI | 4-5h | Phase 2 |
| **4** | Email service | 2h | Phase 1, 2 |
| **5** | Testing & Polish | 2-3h | All phases |
| **Total** | | **13-17h** | ~2-3 days |

---

## 🧪 Testing Checklist

### Backend
- [ ] Create pipeline stages
- [ ] Move application between stages
- [ ] Record stage history correctly
- [ ] Schedule interview with date/time
- [ ] Add recruiter notes
- [ ] Send templated email with variables replaced
- [ ] Email triggers on interview schedule
- [ ] Application filtering by stage

### Frontend
- [ ] Kanban board displays all stages
- [ ] Drag & drop to change stage
- [ ] Application detail modal opens
- [ ] Interview scheduler sets date/time/location
- [ ] Recruiter notes save and display
- [ ] Email composer loads templates
- [ ] Email preview shows replaced variables
- [ ] Stage history timeline renders
- [ ] Resume download works
- [ ] Mobile responsive

---

## 🚀 Deployment Plan

1. **Database Migration**
   ```bash
   npm run db:push  # Apply new schema
   npm run seed:defaults  # Seed default stages & templates
   ```

2. **Deploy to Railway**
   - Push to GitHub
   - Railway auto-deploys
   - Verify database migrations applied

3. **Test with Real Data**
   - Create test job as recruiter
   - Submit test application
   - Move through pipeline stages
   - Schedule interview
   - Send email

---

## 💡 Future Enhancements (Out of Scope for Now)

- **Candidate Portal** - Let candidates see their application status
- **Calendar Integration** - Sync interviews with Google Calendar
- **Bulk Actions** - Move multiple candidates at once
- **Advanced Analytics** - Time-to-hire, conversion rates per stage
- **Custom Fields** - Company-specific data fields
- **Team Collaboration** - @mentions in notes, shared views
- **SMS Notifications** - Text message reminders
- **Video Interview Integration** - Embed Zoom/Meet links
- **AI Resume Parsing** - Auto-extract candidate data

---

## 📊 Success Metrics

After implementation, we should have:
- ✅ Recruiters can move candidates through 6 default stages
- ✅ Recruiters can schedule interviews with date/time/location
- ✅ Automated interview invitation emails sent
- ✅ Internal notes tracked per candidate
- ✅ Stage change history visible
- ✅ Email templates customizable
- ✅ Kanban board view for visual pipeline
- ✅ ~90% less complex than the legacy SpotAxis service, 100% of needed features

---

## 🎯 Key Differences from the Legacy SpotAxis Service

| Feature | SpotAxis | VantaHire ATS |
|---------|----------|---------------|
| **Complexity** | Enterprise (1000+ files) | Lightweight (< 20 files) |
| **User Roles** | 3+ roles, complex permissions | 2 roles (recruiter, candidate) |
| **Company System** | Multi-tenant subdomains | Single platform |
| **Payments** | Subscription billing | Free (for now) |
| **Candidate Profiles** | Full profile builder | Simple resume upload |
| **Focus** | Full HR platform | Job board + essential ATS |

---

**Next Step**: Review and approve this plan, then we'll start with Phase 1 (Database Schema) 🚀
