# VantaHire Organization & Subscription System - QA Testing Checklist

**Version:** 1.0
**Last Updated:** January 2026
**Test Environment:** Staging / Production

---

## How to Use This Document

1. Create a copy for each tester
2. Mark each test with: ✅ Pass | ❌ Fail | ⏭️ Skipped | 🔄 Blocked
3. Add notes for any failures or unexpected behavior
4. Report bugs with test case ID (e.g., ORG-001)

---

## Prerequisites

Before testing, ensure you have:
- [ ] Access to staging environment
- [ ] Test email accounts (use `+tag` format: `yourname+test1@company.com`)
- [ ] Cashfree sandbox credentials configured
- [ ] Super admin account access
- [ ] Browser dev tools available for debugging

---

## 1. Organization Creation & Onboarding

### ORG-001: New Recruiter Signup → Create Organization
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to `/auth` and click "Register" | Registration form displayed | | |
| 2 | Fill form with new email, select "Recruiter" role | Form accepts input | | |
| 3 | Submit registration | Success message, verification email sent | | |
| 4 | Check email inbox | Verification email received | | |
| 5 | Click verification link | Email verified, redirected to org choice page | | |
| 6 | Verify org choice page shows options | "Create Organization" and "Join Organization" buttons visible | | |
| 7 | Click "Create Organization" | Create org form displayed | | |
| 8 | Enter organization name | Form accepts input | | |
| 9 | Submit | Organization created, redirected to dashboard | | |
| 10 | Check dashboard | User is org owner, Free plan active, 1 seat | | |

### ORG-002: New Recruiter Signup → Join via Invite Code
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | (Prerequisite) Have an existing org owner send invite | Invite sent | | |
| 2 | Register new recruiter account | Registration successful | | |
| 3 | Verify email | Redirected to org choice page | | |
| 4 | Click "Join Organization" | Join form displayed | | |
| 5 | Enter invite code/token | Code validated | | |
| 6 | Submit | Joined organization, redirected to dashboard | | |
| 7 | Check dashboard | User is member, org name shown | | |

### ORG-003: Request to Join (Domain Match)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | (Prerequisite) Org has verified domain `@company.com` | Domain verified | | |
| 2 | Register with email `newuser@company.com` | Registration successful | | |
| 3 | Verify email | Org choice page shows "Request to Join [Org Name]" option | | |
| 4 | Click "Request to Join" | Request submitted, pending message shown | | |
| 5 | Login as org owner | See pending join request | | |
| 6 | Approve request | Request approved | | |
| 7 | Login as new user | Now a member of the organization | | |

### ORG-004: Reject Join Request
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Have pending join request (from ORG-003) | Request visible to owner | | |
| 2 | Login as org owner | See pending join request | | |
| 3 | Click "Reject" with reason | Rejection dialog appears | | |
| 4 | Enter reason and confirm | Request rejected | | |
| 5 | Login as requester | No org access, can create own org | | |

---

## 2. Team & Membership Management

### TEAM-001: Invite New Member (Seats Available)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner/admin | Dashboard loaded | | |
| 2 | Go to Settings → Team | Team page displayed | | |
| 3 | Click "Invite Member" | Invite modal opens | | |
| 4 | Enter email and select role (member/admin) | Form accepts input | | |
| 5 | Submit | Invite sent, appears in pending list | | |
| 6 | Check invitee's email | Invite email received with link | | |
| 7 | Click invite link (new user) | Registration + join flow | | |
| 8 | Complete registration | Joined org as specified role | | |

### TEAM-002: Invite When No Seats Available
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Ensure org has all seats filled | No available seats | | |
| 2 | Go to Settings → Team → Invite | Invite modal opens | | |
| 3 | Try to send invite | Error: "No seats available. Purchase more seats first." | | |
| 4 | Click link to purchase seats | Redirected to billing page | | |

### TEAM-003: Invite Existing User (Already in Another Org)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Try to invite user who is in another org | Invite sent | | |
| 2 | User tries to accept invite | Error: "You are already a member of another organization" | | |
| 3 | User must leave current org first | Leave option shown | | |

### TEAM-004: Cancel Pending Invite
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to Settings → Team | See pending invites list | | |
| 2 | Click "Cancel" on pending invite | Confirmation dialog | | |
| 3 | Confirm cancellation | Invite removed from list | | |
| 4 | Try to use cancelled invite link | Error: "Invite is invalid or expired" | | |

### TEAM-005: Expired Invite Token
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Wait for invite to expire (7 days) or manually expire in DB | Invite expired | | |
| 2 | Try to use expired invite link | Error: "Invite has expired" | | |

### TEAM-006: Remove Member
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner/admin | Dashboard loaded | | |
| 2 | Go to Settings → Team | Member list displayed | | |
| 3 | Click "Remove" on a member | Confirmation dialog | | |
| 4 | If member has content, prompt for reassignment | Reassignment options shown | | |
| 5 | Select reassignment option and confirm | Member removed, content reassigned | | |
| 6 | Verify removed member's access | Cannot access org resources | | |

### TEAM-007: Member Leaves Organization
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org member (not owner) | Dashboard loaded | | |
| 2 | Go to Settings → Team | "Leave Organization" button visible | | |
| 3 | Click "Leave Organization" | Confirmation dialog with warnings | | |
| 4 | If has content, see reassignment prompt | Options to reassign jobs/data | | |
| 5 | Confirm leave | Left organization | | |
| 6 | Verify redirect | Redirected to org choice page | | |
| 7 | Try to access old org data | Access denied | | |

### TEAM-008: Change Member Role
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Team | Member list displayed | | |
| 3 | Click role dropdown for a member | Role options shown | | |
| 4 | Change from "Member" to "Admin" | Role updated | | |
| 5 | Verify in list | New role displayed | | |
| 6 | Login as that user | Has admin permissions | | |

### TEAM-009: Owner Cannot Be Removed
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Team | Member list displayed | | |
| 3 | Check owner row | No "Remove" button for owner | | |
| 4 | Owner cannot leave without transferring ownership | Leave button disabled or shows transfer prompt | | |

---

## 3. Seat Management

### SEAT-001: View Seat Usage
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Check seat usage display | Shows "X of Y seats used" | | |
| 4 | Visual bar shows usage | Progress bar accurate | | |

### SEAT-002: Seat Reduction (Manual Selection)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Have org with 3+ members on Pro plan | Setup complete | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Click "Reduce Seats" | Seat selection modal opens | | |
| 4 | Verify owner is pre-selected and locked | Owner checkbox checked, disabled | | |
| 5 | See member list with last activity | Activity timestamps shown | | |
| 6 | Select members to keep (less than current) | Selection updates | | |
| 7 | See warning about unseated members | Warning message displayed | | |
| 8 | Confirm reduction | Seats reduced | | |
| 9 | Verify unseated members | Cannot access app, see blocked page | | |

### SEAT-003: Unseated Member Experience
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as unseated member | Credentials accepted | | |
| 2 | Verify redirect | Redirected to `/blocked/seat-removed` | | |
| 3 | See blocked page content | Message: "Your seat has been removed" | | |
| 4 | See org name and owner contact | Information displayed | | |
| 5 | Click "Contact Owner" | Email link works | | |
| 6 | Click "Leave Organization" | Leave flow initiated | | |
| 7 | Try to access any feature | All routes redirect to blocked page | | |

### SEAT-004: Re-seat Member
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Have unseated member in org | Member exists, seatAssigned=false | | |
| 2 | Login as owner, add seats | Seats increased | | |
| 3 | Go to Team settings | See unseated member in list | | |
| 4 | Click "Assign Seat" on unseated member | Seat assigned | | |
| 5 | Login as that member | Full access restored | | |

---

## 4. Subscription & Billing

### SUB-001: View Current Subscription
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | See current plan | Plan name, price, features shown | | |
| 4 | See billing cycle | Monthly/Annual displayed | | |
| 5 | See next billing date | Date shown | | |

### SUB-002: Upgrade Free → Pro (Monthly)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner on Free plan | Dashboard loaded | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Click "Upgrade to Growth" | Plan selection displayed | | |
| 4 | Select seat count (e.g., 3) | Price calculated: ₹999 × 3 + GST | | |
| 5 | Select "Monthly" billing | Monthly option selected | | |
| 6 | Click "Proceed to Payment" | Redirected to Cashfree checkout | | |
| 7 | Complete payment (use test card) | Payment successful | | |
| 8 | Verify redirect | Back to app, success message | | |
| 9 | Check billing page | Pro plan active, 3 seats | | |
| 10 | Check AI credits | 600 × 3 = 1800 credits allocated | | |

### SUB-003: Upgrade Free → Pro (Annual)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1-5 | Same as SUB-002 | ... | | |
| 6 | Select "Annual" billing | Annual option, discount shown | | |
| 7-10 | Complete payment flow | Annual subscription active | | |

### SUB-004: Add Seats (Prorated)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner on Pro plan | Dashboard loaded | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Click "Add Seats" | Seat addition form | | |
| 4 | Select number of seats to add | Price shows prorated amount | | |
| 5 | Complete payment | Payment successful | | |
| 6 | Verify seat count increased | New total shown | | |
| 7 | Verify AI credits increased | Additional credits allocated | | |

### SUB-005: Downgrade Pro → Free
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner on Pro plan with multiple members | Setup complete | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Click "Downgrade to Free" | Warning displayed | | |
| 4 | See seat selection (only 1 seat on Free) | Owner pre-selected | | |
| 5 | Confirm downgrade | Downgrade scheduled for period end | | |
| 6 | Verify message | "Downgrade effective on [date]" | | |
| 7 | Wait for period end (or simulate) | Downgrade applied | | |
| 8 | Verify other members unseated | Only owner has access | | |

### SUB-006: Cancel Subscription
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner on Pro plan | Dashboard loaded | | |
| 2 | Go to Settings → Billing | Billing page displayed | | |
| 3 | Click "Cancel Subscription" | Confirmation dialog | | |
| 4 | Confirm cancellation | Cancellation scheduled | | |
| 5 | Verify message | "Access until [period end date]" | | |
| 6 | Check billing page | Shows "Cancelling" status | | |

### SUB-007: GSTIN Invoice
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to Settings → Billing | Billing page displayed | | |
| 2 | Click "Add GSTIN" | GSTIN form displayed | | |
| 3 | Enter valid GSTIN | Validated | | |
| 4 | Enter billing address | Form accepts input | | |
| 5 | Save | GSTIN saved | | |
| 6 | Make a payment | Invoice generated | | |
| 7 | Download invoice | GST breakdown shown on invoice | | |

### SUB-008: Invoice Without GSTIN
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Ensure no GSTIN entered | GSTIN field empty | | |
| 2 | Make a payment | Invoice generated | | |
| 3 | Download invoice | Tax-inclusive pricing shown | | |

### SUB-009: View Invoice History
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to Settings → Billing | Billing page displayed | | |
| 2 | Scroll to "Invoice History" | List of past invoices | | |
| 3 | Click "Download" on invoice | PDF downloaded | | |
| 4 | Verify invoice content | Correct amounts, dates, details | | |

---

## 5. Payment Failure & Grace Period

### PAY-001: Payment Failure → Grace Period
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | (Simulate) Trigger payment failure | Payment fails | | |
| 2 | Verify grace period started | 3-day grace period active | | |
| 3 | Check owner's email | Payment failure notification received | | |
| 4 | Login as owner | Warning banner shown | | |
| 5 | Verify full access during grace | All features work | | |

### PAY-002: Payment Recovery During Grace
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Have active grace period | Grace period active | | |
| 2 | Update payment method | New card added | | |
| 3 | Retry payment | Payment successful | | |
| 4 | Verify subscription restored | Full access, no warnings | | |

### PAY-003: Grace Period Expiry → Auto-Downgrade
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Let grace period expire (3 days) | Grace expired | | |
| 2 | Verify auto-downgrade triggered | Subscription downgraded | | |
| 3 | Check who kept seats | Owner + most active members | | |
| 4 | Check unseated members' email | Notification received | | |
| 5 | Login as unseated member | Blocked page shown | | |

### PAY-004: Renewal Reminders
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | (Simulate) 7 days before renewal | Trigger scheduler | | |
| 2 | Check owner's email | 7-day reminder received | | |
| 3 | (Simulate) 3 days before renewal | Trigger scheduler | | |
| 4 | Check owner's email | 3-day reminder received | | |
| 5 | (Simulate) 1 day before renewal | Trigger scheduler | | |
| 6 | Check owner's email | 1-day reminder received | | |

---

## 6. AI Credits

### AI-001: View Credit Balance
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org member | Dashboard loaded | | |
| 2 | Find credit balance display | Credits shown in header/sidebar | | |
| 3 | Verify amount | Matches plan allocation | | |

### AI-002: Use AI Credits
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Use an AI feature (e.g., job analysis) | Feature works | | |
| 2 | Check credit balance | Reduced by usage amount | | |
| 3 | View usage history | Recent usage logged | | |

### AI-003: Credit Exhaustion
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Use all available credits | Balance = 0 | | |
| 2 | Try to use AI feature | Error: "No credits remaining" | | |
| 3 | See upgrade prompt | Option to upgrade for more credits | | |

### AI-004: Credit Rollover (Pro Plan)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Have unused credits at period end | Credits remaining | | |
| 2 | Period renews | Credits roll over | | |
| 3 | Verify new balance | New allocation + rollover (max 3 months) | | |

### AI-005: Credit Forfeiture on Unseat
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Note member's credit balance | Credits recorded | | |
| 2 | Unseat that member | Member unseated | | |
| 3 | Re-seat that member | Member re-seated | | |
| 4 | Check credit balance | Credits reset (not restored) | | |

---

## 7. Domain Verification

### DOM-001: Request Domain Claim
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Organization | Org settings displayed | | |
| 3 | Click "Claim Domain" | Domain claim form | | |
| 4 | Enter domain (must match owner's email) | Domain entered | | |
| 5 | Submit request | Request submitted, pending status | | |
| 6 | Verify in list | Shows "Pending Approval" | | |

### DOM-002: Super Admin Approves Domain
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as super_admin | Admin dashboard | | |
| 2 | Go to Admin → Domain Claims | Pending claims list | | |
| 3 | Review claim details | Org name, domain, requester shown | | |
| 4 | Click "Approve" | Confirmation dialog | | |
| 5 | Confirm approval | Domain approved | | |
| 6 | Check org settings | Domain now verified | | |

### DOM-003: Super Admin Rejects Domain
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as super_admin | Admin dashboard | | |
| 2 | Go to Admin → Domain Claims | Pending claims list | | |
| 3 | Click "Reject" on a claim | Rejection form | | |
| 4 | Enter rejection reason | Reason entered | | |
| 5 | Confirm rejection | Claim rejected | | |
| 6 | Login as org owner | See rejection with reason | | |

### DOM-004: Public Email Domain Blocked
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as owner with gmail.com email | Dashboard loaded | | |
| 2 | Try to claim domain | Error: "Cannot claim public email domains" | | |

---

## 8. Access Control & Permissions

### ACC-001: NO_ORGANIZATION Error
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Create recruiter without org | Recruiter created | | |
| 2 | Try to access /api/my-jobs | 403 with code: "NO_ORGANIZATION" | | |
| 3 | UI shows appropriate message | Prompt to create/join org | | |

### ACC-002: NO_SEAT Error
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as unseated member | Credentials accepted | | |
| 2 | Try to access /api/my-jobs | 403 with code: "NO_SEAT" | | |
| 3 | UI redirects to blocked page | Seat removed message shown | | |

### ACC-003: Job Visibility - Own Jobs
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org member | Dashboard loaded | | |
| 2 | Create a job | Job created | | |
| 3 | View My Jobs | Own job visible | | |
| 4 | Login as different member | Dashboard loaded | | |
| 5 | View My Jobs | Other member's job NOT visible | | |

### ACC-004: Job Visibility - Co-Recruiter
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Create job as Member A | Job created | | |
| 2 | Add Member B as co-recruiter | Co-recruiter added | | |
| 3 | Login as Member B | Dashboard loaded | | |
| 4 | View My Jobs | Member A's shared job visible | | |

### ACC-005: Super Admin Visibility
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as super_admin | Admin dashboard | | |
| 2 | Go to Admin → All Jobs | All jobs listed | | |
| 3 | Verify jobs from multiple orgs | Cross-org visibility works | | |

---

## 9. Admin Panel (Super Admin)

### ADM-001: View All Organizations
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as super_admin | Admin dashboard | | |
| 2 | Go to Admin → Organizations | Org list displayed | | |
| 3 | See org details | Name, owner, plan, members shown | | |
| 4 | Search/filter works | Filtering functional | | |

### ADM-002: Grant Subscription
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to Admin → Subscriptions | Subscription list | | |
| 2 | Find org on Free plan | Org found | | |
| 3 | Click "Grant Pro" | Grant form displayed | | |
| 4 | Select duration and seats | Options selected | | |
| 5 | Enter reason | Reason entered | | |
| 6 | Confirm grant | Pro plan granted | | |
| 7 | Verify org's subscription | Pro plan active, admin override noted | | |

### ADM-003: Extend Subscription
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Find org with expiring subscription | Org found | | |
| 2 | Click "Extend" | Extension form | | |
| 3 | Select extension period | Period selected | | |
| 4 | Enter reason | Reason entered | | |
| 5 | Confirm extension | Subscription extended | | |

### ADM-004: View Platform Analytics
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Go to Admin → Analytics | Analytics dashboard | | |
| 2 | View MRR | Monthly recurring revenue shown | | |
| 3 | View churn rate | Churn metrics displayed | | |
| 4 | View AI usage | Credit consumption stats | | |

---

## 10. Edge Cases & Error Handling

### EDGE-001: Concurrent Invite Accept
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Send invite to user | Invite sent | | |
| 2 | Open invite link in two browsers | Both load accept page | | |
| 3 | Click accept simultaneously | One succeeds, one fails gracefully | | |

### EDGE-002: Owner Transfer (Not Implemented)
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Try to transfer ownership | Feature not available | | |
| 2 | Owner cannot leave without deleting org | Appropriate message shown | | |

### EDGE-003: Delete Organization
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Login as org owner | Dashboard loaded | | |
| 2 | Go to Settings → Organization | Org settings displayed | | |
| 3 | Click "Delete Organization" | Strong warning displayed | | |
| 4 | Type org name to confirm | Confirmation required | | |
| 5 | Confirm deletion | Org deleted, all members removed | | |
| 6 | Verify data deleted | Jobs, applications, etc. removed | | |

### EDGE-004: Network Error During Payment
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Start checkout process | Checkout initiated | | |
| 2 | Simulate network disconnect | Connection lost | | |
| 3 | Reconnect and check status | Pending payment handled gracefully | | |

### EDGE-005: Webhook Idempotency
| Step | Action | Expected Result | Status | Notes |
|------|--------|-----------------|--------|-------|
| 1 | Trigger payment webhook | Webhook processed | | |
| 2 | Resend same webhook (duplicate) | Skipped as duplicate | | |
| 3 | Verify no double processing | Single transaction recorded | | |

---

## Bug Report Template

When reporting bugs, use this template:

```
**Test Case ID:** [e.g., ORG-001]
**Severity:** Critical / High / Medium / Low
**Environment:** Staging / Production
**Browser:** Chrome / Firefox / Safari / Edge
**Date:** YYYY-MM-DD

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Result:**
...

**Actual Result:**
...

**Screenshots/Videos:**
[Attach if applicable]

**Console Errors:**
[Paste any console errors]

**Additional Notes:**
...
```

---

## Sign-Off

| Tester | Date | Tests Completed | Pass | Fail | Blocked |
|--------|------|-----------------|------|------|---------|
| | | | | | |
| | | | | | |

**Overall Status:** ☐ Ready for Release | ☐ Needs Fixes | ☐ Blocked

**Notes:**
