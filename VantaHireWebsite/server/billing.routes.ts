import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth";
import { getUserOrganization, updateOrganization } from "./lib/organizationService";
import { canManageBilling } from "./lib/membershipService";

// Input validation schemas
const updateBillingSchema = z.object({
  gstin: z.string().max(15).optional().nullable(),
  billingName: z.string().max(200).optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  billingCity: z.string().max(100).optional().nullable(),
  billingState: z.string().max(100).optional().nullable(),
  billingPincode: z.string().max(10).optional().nullable(),
  billingContactEmail: z.string().email().optional().nullable(),
  billingContactName: z.string().max(200).optional().nullable(),
});

// Indian states for validation
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];

// GSTIN regex pattern
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Validate GSTIN format
function isValidGSTIN(gstin: string): boolean {
  return GSTIN_PATTERN.test(gstin.toUpperCase());
}

export function registerBillingRoutes(
  app: Express,
  csrfProtection: any
) {
  // Get billing info
  app.get("/api/billing", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      const org = orgResult.organization;

      res.json({
        gstin: org.gstin,
        billingName: org.billingName || org.name,
        billingAddress: org.billingAddress,
        billingCity: org.billingCity,
        billingState: org.billingState,
        billingPincode: org.billingPincode,
        billingContactEmail: org.billingContactEmail,
        billingContactName: org.billingContactName,
        hasGSTIN: !!org.gstin,
        states: INDIAN_STATES,
      });
    } catch (error: any) {
      console.error("Error getting billing info:", error);
      res.status(500).json({ error: "Failed to get billing info" });
    }
  });

  // Update billing info
  app.patch("/api/billing", requireAuth, csrfProtection, async (req, res) => {
    try {
      const user = req.user!;
      const orgResult = await getUserOrganization(user.id);

      if (!orgResult) {
        res.status(404).json({ error: "Not a member of any organization" });
        return;
      }

      if (!canManageBilling(orgResult.membership.role as any)) {
        res.status(403).json({ error: "Only organization owner can update billing" });
        return;
      }

      const data = updateBillingSchema.parse(req.body);

      // Validate GSTIN if provided
      if (data.gstin && !isValidGSTIN(data.gstin)) {
        res.status(400).json({ error: "Invalid GSTIN format" });
        return;
      }

      // Validate state if GSTIN is provided
      if (data.gstin && data.billingState && !INDIAN_STATES.includes(data.billingState)) {
        res.status(400).json({ error: "Invalid state for GST purposes" });
        return;
      }

      // Convert null to undefined for the update function
      const updateData = {
        gstin: data.gstin ?? undefined,
        billingName: data.billingName ?? undefined,
        billingAddress: data.billingAddress ?? undefined,
        billingCity: data.billingCity ?? undefined,
        billingState: data.billingState ?? undefined,
        billingPincode: data.billingPincode ?? undefined,
        billingContactEmail: data.billingContactEmail ?? undefined,
        billingContactName: data.billingContactName ?? undefined,
      };
      const updated = await updateOrganization(orgResult.organization.id, updateData);

      res.json({
        gstin: updated?.gstin,
        billingName: updated?.billingName,
        billingAddress: updated?.billingAddress,
        billingCity: updated?.billingCity,
        billingState: updated?.billingState,
        billingPincode: updated?.billingPincode,
        billingContactEmail: updated?.billingContactEmail,
        billingContactName: updated?.billingContactName,
      });
    } catch (error: any) {
      console.error("Error updating billing info:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message || "Failed to update billing info" });
    }
  });

  // Validate GSTIN
  app.post("/api/billing/validate-gstin", requireAuth, async (req, res) => {
    try {
      const { gstin } = req.body;

      if (!gstin) {
        res.status(400).json({ error: "GSTIN is required" });
        return;
      }

      const isValid = isValidGSTIN(gstin);

      if (!isValid) {
        res.json({
          valid: false,
          error: "Invalid GSTIN format",
        });
        return;
      }

      // Extract state code from GSTIN (first 2 digits)
      const stateCode = gstin.substring(0, 2);
      const stateCodeMap: Record<string, string> = {
        '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
        '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
        '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
        '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
        '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
        '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
        '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
        '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
        '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra',
        '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
        '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
        '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
        '37': 'Andhra Pradesh', '38': 'Ladakh',
      };

      const state = stateCodeMap[stateCode];

      res.json({
        valid: true,
        gstin: gstin.toUpperCase(),
        state,
        stateCode,
      });
    } catch (error: any) {
      console.error("Error validating GSTIN:", error);
      res.status(500).json({ error: "Failed to validate GSTIN" });
    }
  });
}
