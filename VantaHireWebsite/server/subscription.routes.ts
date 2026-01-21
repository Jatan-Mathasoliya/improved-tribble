import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth";
import { getUserOrganization } from "./lib/organizationService";
import { canManageBilling } from "./lib/membershipService";
import {
  getActivePlans,
  getPlanById,
  getOrganizationSubscription,
  createPaidSubscription,
  updateSubscriptionSeats,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  getSubscriptionInvoices,
  calculateProratedAmount,
} from "./lib/subscriptionService";
import type { BillingCycle } from "@shared/schema";
import { organizationSubscriptions } from "@shared/schema";
import {
  getSeatUsage,
  getMembersForSeatSelection,
  reduceSeats,
  assignSeat,
  unassignSeat,
} from "./lib/seatService";
import {
  getMemberCreditBalance,
  getOrgCreditSummary,
  getCreditUsageHistory,
} from "./lib/creditService";
import {
  createCheckoutOrder,
  createSeatAddCheckout,
  getOrderStatus,
  isCashfreeConfigured,
} from "./lib/cashfreeClient";
import {
  createPaymentTransaction,
  updatePaymentTransaction,
  getOrganizationInvoices as getInvoices,
  getTransactionByCashfreeOrder,
  generateInvoiceData,
} from "./lib/invoiceService";
import {
  generateAndStoreInvoicePdf,
  getLocalInvoicePath,
} from "./lib/invoicePdfService";
import { getEmailService } from "./simpleEmailService";
import { db } from "./db";
import { organizationMembers, users } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

// Input validation schemas
const checkoutSchema = z.object({
  planId: z.number().int().positive(),
  seats: z.number().int().min(1).max(1000),
  billingCycle: z.enum(['monthly', 'annual']),
});

const addSeatsSchema = z.object({
  additionalSeats: z.number().int().min(1).max(100),
});

const reduceSeatsSchema = z.object({
  newSeatCount: z.number().int().min(1),
  memberIdsToKeep: z.array(z.number().int().positive()),
});

const seatAssignSchema = z.object({
  memberId: z.number().int().positive(),
});

export function registerSubscriptionRoutes(
  app: Express,
  csrfProtection: any
) {
  // ===== Plans =====

  // List available plans
  app.get("/api/subscription/plans", async (req, res) => {
    try {
      const plans = await getActivePlans();
      res.json(plans);
    } catch (error: any) {
      console.error("Error listing plans:", error);
      res.status(500).json({ error: "Failed to list plans" });
    }
  });

  // ===== Current Subscription =====

  // Get current subscription
  app.get("/api/subscription", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgResult.organization.id);

      if (!subscription) {
        res.json({
          plan: { name: 'free', displayName: 'Free' },
          seats: 1,
          status: 'active',
        });
        return;
      }

      res.json({
        id: subscription.id,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          displayName: subscription.plan.displayName,
          pricePerSeatMonthly: subscription.plan.pricePerSeatMonthly,
          pricePerSeatAnnual: subscription.plan.pricePerSeatAnnual,
          aiCreditsPerSeatMonthly: subscription.plan.aiCreditsPerSeatMonthly,
        },
        seats: subscription.seats,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      });
    } catch (error: any) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  });

  // ===== Checkout =====

  // Create checkout session
  app.post("/api/subscription/checkout", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can manage billing" });
        return;
      }

      if (!isCashfreeConfigured()) {
        res.status(500).json({ error: "Payment system not configured" });
        return;
      }

      const { planId, seats, billingCycle } = checkoutSchema.parse(req.body);

      const plan = await getPlanById(planId);
      if (!plan || plan.name === 'free') {
        res.status(400).json({ error: "Invalid plan" });
        return;
      }

      const returnUrl = `${process.env.APP_URL || 'http://localhost:5001'}/settings/billing?order_id={order_id}`;

      const checkout = await createCheckoutOrder(
        orgResult.organization,
        plan,
        seats,
        billingCycle,
        orgResult.organization.billingContactEmail || user.username,
        undefined,
        returnUrl
      );

      // Create pending transaction
      await createPaymentTransaction(
        orgResult.organization.id,
        null,
        'subscription',
        checkout.amount,
        checkout.taxAmount,
        checkout.totalAmount,
        'pending',
        checkout.orderId,
        { planId, seats, billingCycle }
      );

      res.json({
        orderId: checkout.orderId,
        sessionId: checkout.sessionId,
        paymentLink: checkout.paymentLink,
        amount: checkout.amount,
        taxAmount: checkout.taxAmount,
        totalAmount: checkout.totalAmount,
      });
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to create checkout" });
    }
  });

  // ===== Seats =====

  // Get seat usage
  app.get("/api/subscription/seats/usage", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      const usage = await getSeatUsage(orgResult.organization.id);
      const members = await getMembersForSeatSelection(orgResult.organization.id);

      res.json({
        ...usage,
        members,
      });
    } catch (error: any) {
      console.error("Error getting seat usage:", error);
      res.status(500).json({ error: "Failed to get seat usage" });
    }
  });

  // Add seats (prorated)
  app.post("/api/subscription/seats", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can add seats" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgResult.organization.id);
      if (!subscription || subscription.plan.name === 'free') {
        res.status(400).json({ error: "Please upgrade to a paid plan first" });
        return;
      }

      const { additionalSeats } = addSeatsSchema.parse(req.body);

      // Calculate prorated amount
      const pricePerSeat = subscription.billingCycle === 'annual'
        ? subscription.plan.pricePerSeatAnnual
        : subscription.plan.pricePerSeatMonthly;

      const proratedAmount = calculateProratedAmount(
        pricePerSeat,
        additionalSeats,
        subscription.currentPeriodEnd,
        subscription.billingCycle as BillingCycle
      );

      // If amount is 0 or very small, just add seats directly
      if (proratedAmount < 100) { // Less than ₹1
        await updateSubscriptionSeats(
          subscription.id,
          subscription.seats + additionalSeats,
          user.id
        );

        res.json({
          success: true,
          newSeats: subscription.seats + additionalSeats,
          charged: 0,
        });
        return;
      }

      // Create checkout for prorated amount
      if (!isCashfreeConfigured()) {
        res.status(500).json({ error: "Payment system not configured" });
        return;
      }

      const returnUrl = `${process.env.APP_URL || 'http://localhost:5001'}/settings/billing?order_id={order_id}&type=seat_add`;

      const checkout = await createSeatAddCheckout(
        orgResult.organization,
        subscription.id,
        additionalSeats,
        proratedAmount,
        orgResult.organization.billingContactEmail || user.username,
        undefined,
        returnUrl
      );

      // Create pending transaction record
      await createPaymentTransaction(
        orgResult.organization.id,
        subscription.id,
        'seat_addition',
        checkout.amount,
        checkout.taxAmount,
        checkout.totalAmount,
        'pending',
        checkout.orderId,
        { additionalSeats, proratedAmount }
      );

      res.json({
        checkoutUrl: checkout.paymentLink,
        orderId: checkout.orderId,
        proratedAmount,
        taxAmount: checkout.taxAmount,
        totalAmount: checkout.totalAmount,
        additionalSeats,
        requiresPayment: true,
      });
    } catch (error: any) {
      console.error("Error adding seats:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to add seats" });
    }
  });

  // Reduce seats
  app.post("/api/subscription/seats/reduce", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can reduce seats" });
        return;
      }

      const { newSeatCount, memberIdsToKeep } = reduceSeatsSchema.parse(req.body);

      const result = await reduceSeats(
        orgResult.organization.id,
        newSeatCount,
        memberIdsToKeep,
        user.id
      );

      // Send notification emails to unseated members
      if (result.unseatedCount > 0) {
        const emailService = await getEmailService();
        if (emailService) {
          // Get unseated members (those not in memberIdsToKeep)
          const unseatedMembers = await db
            .select({
              email: users.username,
              firstName: users.firstName,
            })
            .from(organizationMembers)
            .innerJoin(users, eq(organizationMembers.userId, users.id))
            .where(
              and(
                eq(organizationMembers.organizationId, orgResult.organization.id),
                eq(organizationMembers.seatAssigned, false)
              )
            );

          const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
          const orgName = orgResult.organization.name;

          for (const member of unseatedMembers) {
            const name = member.firstName || 'there';
            await emailService.sendEmail({
              to: member.email,
              subject: `Your seat at ${orgName} has been removed`,
              html: `
                <h2>Seat Removed</h2>
                <p>Hi ${name},</p>
                <p>Your seat at <strong>${orgName}</strong> has been removed due to a subscription change.</p>
                <p>You will no longer have access to the VantaHire dashboard until a seat is reassigned to you.</p>
                <p>If you believe this is a mistake, please contact your organization owner.</p>
                <p><a href="${baseUrl}/recruiter-auth">Sign in to check your status</a></p>
              `,
              text: `Hi ${name},\n\nYour seat at ${orgName} has been removed. Contact your organization owner if you need access restored.\n\nSign in: ${baseUrl}/recruiter-auth`,
            });
          }
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error reducing seats:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to reduce seats" });
    }
  });

  // Assign seat to member
  app.post("/api/subscription/seats/assign", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can assign seats" });
        return;
      }

      const { memberId } = seatAssignSchema.parse(req.body);

      const member = await assignSeat(memberId);

      res.json(member);
    } catch (error: any) {
      console.error("Error assigning seat:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to assign seat" });
    }
  });

  // Unassign seat from member
  app.post("/api/subscription/seats/unassign", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can unassign seats" });
        return;
      }

      const { memberId } = seatAssignSchema.parse(req.body);

      // Get member info before unassigning
      const memberInfo = await db
        .select({
          email: users.username,
          firstName: users.firstName,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .where(eq(organizationMembers.id, memberId))
        .limit(1);

      const member = await unassignSeat(memberId);

      // Send notification email to unseated member
      if (memberInfo.length > 0) {
        const emailService = await getEmailService();
        if (emailService) {
          const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
          const orgName = orgResult.organization.name;
          const name = memberInfo[0].firstName || 'there';

          await emailService.sendEmail({
            to: memberInfo[0].email,
            subject: `Your seat at ${orgName} has been removed`,
            html: `
              <h2>Seat Removed</h2>
              <p>Hi ${name},</p>
              <p>Your seat at <strong>${orgName}</strong> has been removed.</p>
              <p>You will no longer have access to the VantaHire dashboard until a seat is reassigned to you.</p>
              <p>If you believe this is a mistake, please contact your organization owner.</p>
              <p><a href="${baseUrl}/recruiter-auth">Sign in to check your status</a></p>
            `,
            text: `Hi ${name},\n\nYour seat at ${orgName} has been removed. Contact your organization owner if you need access restored.\n\nSign in: ${baseUrl}/recruiter-auth`,
          });
        }
      }

      res.json(member);
    } catch (error: any) {
      console.error("Error unassigning seat:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to unassign seat" });
    }
  });

  // ===== Cancel/Reactivate =====

  // Cancel subscription at period end
  app.post("/api/subscription/cancel", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can cancel" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgResult.organization.id);
      if (!subscription || subscription.plan.name === 'free') {
        res.status(400).json({ error: "No active paid subscription" });
        return;
      }

      await cancelSubscriptionAtPeriodEnd(subscription.id, user.id);

      res.json({
        success: true,
        message: "Subscription will be cancelled at the end of the current billing period",
        cancelAt: subscription.currentPeriodEnd,
      });
    } catch (error: any) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ error: error.message || "Failed to cancel subscription" });
    }
  });

  // Reactivate subscription
  app.post("/api/subscription/reactivate", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can reactivate" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgResult.organization.id);
      if (!subscription) {
        res.status(400).json({ error: "No subscription found" });
        return;
      }

      await reactivateSubscription(subscription.id, user.id);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error reactivating subscription:", error);
      res.status(500).json({ error: error.message || "Failed to reactivate subscription" });
    }
  });

  // ===== Billing Cycle Change =====

  // Schedule billing cycle change (takes effect at next renewal)
  app.patch("/api/subscription/billing-cycle", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can change billing cycle" });
        return;
      }

      const schema = z.object({
        billingCycle: z.enum(['monthly', 'annual']),
      });
      const { billingCycle } = schema.parse(req.body);

      const subscription = await getOrganizationSubscription(orgResult.organization.id);
      if (!subscription || subscription.plan.name === 'free') {
        res.status(400).json({ error: "No active paid subscription" });
        return;
      }

      if (subscription.billingCycle === billingCycle) {
        res.status(400).json({ error: "Already on this billing cycle" });
        return;
      }

      // Store pending change in featureOverrides (will be applied at renewal)
      await db.update(organizationSubscriptions)
        .set({
          featureOverrides: {
            ...((subscription as any).featureOverrides || {}),
            pendingBillingCycleChange: billingCycle,
          },
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.id, subscription.id));

      res.json({
        success: true,
        message: `Billing cycle will change to ${billingCycle} at next renewal`,
        currentCycle: subscription.billingCycle,
        pendingCycle: billingCycle,
        effectiveAt: subscription.currentPeriodEnd,
      });
    } catch (error: any) {
      console.error("Error changing billing cycle:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to change billing cycle" });
    }
  });

  // Cancel pending billing cycle change
  app.delete("/api/subscription/billing-cycle", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can cancel billing cycle change" });
        return;
      }

      const subscription = await getOrganizationSubscription(orgResult.organization.id);
      if (!subscription) {
        res.status(400).json({ error: "No subscription found" });
        return;
      }

      // Remove pending change from featureOverrides
      const overrides = (subscription as any).featureOverrides || {};
      delete overrides.pendingBillingCycleChange;

      await db.update(organizationSubscriptions)
        .set({
          featureOverrides: Object.keys(overrides).length > 0 ? overrides : null,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.id, subscription.id));

      res.json({ success: true, message: "Pending billing cycle change cancelled" });
    } catch (error: any) {
      console.error("Error cancelling billing cycle change:", error);
      res.status(500).json({ error: error.message || "Failed to cancel billing cycle change" });
    }
  });

  // ===== Invoices =====

  // List invoices
  app.get("/api/subscription/invoices", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      const invoices = await getInvoices(orgResult.organization.id);

      res.json(invoices);
    } catch (error: any) {
      console.error("Error listing invoices:", error);
      res.status(500).json({ error: "Failed to list invoices" });
    }
  });

  // Download invoice PDF
  app.get("/api/subscription/invoices/:transactionId/pdf", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const transactionId = parseInt(req.params.transactionId);
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (isNaN(transactionId)) {
        res.status(400).json({ error: "Invalid transaction ID" });
        return;
      }

      // Get transaction and verify it belongs to this org
      const transaction = await getTransactionByCashfreeOrder(transactionId.toString());
      // Fallback: get by ID
      const invoices = await getInvoices(orgResult.organization.id);
      const invoice = invoices.find(i => i.id === transactionId);

      if (!invoice || invoice.status !== 'completed') {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      // Check if PDF exists, generate if not
      let invoiceUrl = invoice.invoiceUrl;
      if (!invoiceUrl) {
        invoiceUrl = await generateAndStoreInvoicePdf(transactionId);
        if (!invoiceUrl) {
          res.status(500).json({ error: "Failed to generate invoice" });
          return;
        }
      }

      // If URL starts with /api/invoices/, serve the local file
      if (invoiceUrl.startsWith('/api/invoices/')) {
        const fileName = invoiceUrl.replace('/api/invoices/', '');
        const filePath = getLocalInvoicePath(fileName);

        if (!filePath) {
          // Regenerate if file is missing
          invoiceUrl = await generateAndStoreInvoicePdf(transactionId);
          if (!invoiceUrl) {
            res.status(500).json({ error: "Failed to generate invoice" });
            return;
          }

          const newFileName = invoiceUrl.replace('/api/invoices/', '');
          const newFilePath = getLocalInvoicePath(newFileName);

          if (!newFilePath) {
            res.status(500).json({ error: "Invoice file not found" });
            return;
          }

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${newFileName}"`);
          res.sendFile(newFilePath);
          return;
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.sendFile(filePath);
        return;
      }

      // For GCS URLs, redirect
      res.redirect(invoiceUrl);
    } catch (error: any) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ error: "Failed to download invoice" });
    }
  });

  // Serve local invoice files
  app.get("/api/invoices/:fileName", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const { fileName } = req.params;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      // Validate fileName format (INV-XXXX-X-XXXXXX.pdf)
      if (!fileName.match(/^INV-\d{4}-\d+-\d+\.pdf$/)) {
        res.status(400).json({ error: "Invalid invoice file name" });
        return;
      }

      // Verify the invoice belongs to this org by checking invoices
      const invoices = await getInvoices(orgResult.organization.id);
      const invoice = invoices.find(i => i.invoiceNumber && `${i.invoiceNumber}.pdf` === fileName);

      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      const filePath = getLocalInvoicePath(fileName);
      if (!filePath) {
        res.status(404).json({ error: "Invoice file not found" });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.sendFile(filePath);
    } catch (error: any) {
      console.error("Error serving invoice:", error);
      res.status(500).json({ error: "Failed to serve invoice" });
    }
  });

  // ===== AI Credits =====

  // Get current credit balance
  app.get("/api/ai/credits", requireAuth, async (req, res) => {
    try {
      const user = req.user!;

      const balance = await getMemberCreditBalance(user.id);

      if (!balance) {
        res.json({
          allocated: 0,
          used: 0,
          remaining: 0,
          hasCredits: false,
        });
        return;
      }

      res.json({
        ...balance,
        hasCredits: balance.remaining > 0,
      });
    } catch (error: any) {
      console.error("Error getting credits:", error);
      res.status(500).json({ error: "Failed to get credits" });
    }
  });

  // Get credit usage history
  app.get("/api/ai/credits/usage", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      // Get org summary if owner/admin
      const isAdmin = orgResult.membership.role === 'owner' || orgResult.membership.role === 'admin';

      const userHistory = await getCreditUsageHistory(user.id);
      const orgSummary = isAdmin ? await getOrgCreditSummary(orgResult.organization.id) : null;

      res.json({
        userHistory,
        orgSummary,
      });
    } catch (error: any) {
      console.error("Error getting credit usage:", error);
      res.status(500).json({ error: "Failed to get credit usage" });
    }
  });

  // ===== Verify Order Status =====

  // Check order status (for return URL handling)
  app.get("/api/subscription/order/:orderId/status", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const { orderId } = req.params;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      // Verify order belongs to this org
      const transaction = await getTransactionByCashfreeOrder(orderId);
      if (!transaction || transaction.organizationId !== orgResult.organization.id) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      // Check Cashfree for latest status
      const orderStatus = await getOrderStatus(orderId);

      res.json({
        orderId,
        status: transaction.status,
        cashfreeStatus: orderStatus.status,
        paymentMethod: orderStatus.paymentMethod,
      });
    } catch (error: any) {
      console.error("Error getting order status:", error);
      res.status(500).json({ error: "Failed to get order status" });
    }
  });
}
