/**
 * Seed default WhatsApp message templates
 * These templates match the email templates for consistent candidate communication
 *
 * Note: For production (Meta WhatsApp Business API), templates must be:
 * 1. Submitted to Meta for approval
 * 2. Approved before use (takes 24-48 hours)
 * 3. Use numbered placeholders: {{1}}, {{2}}, etc.
 *
 * For local testing, templates work immediately with TestWhatsAppService
 */

import { db } from './db';
import { whatsappTemplates } from '../shared/schema';
import { eq } from 'drizzle-orm';

export async function seedDefaultWhatsAppTemplates() {
  console.log('🌱 Seeding default WhatsApp templates...');

  const defaultTemplates = [
    {
      name: 'Application Received',
      metaTemplateName: 'Candidate Application Received',
      language: 'en',
      templateType: 'application_received',
      category: 'UTILITY',
      bodyTemplate: 'Hello {{1}}, thank you for applying for the {{2}} position at VantaHire. We have received your application and will review it shortly. Best regards, {{3}}',
      status: 'approved', // Auto-approved for test mode
    },
    {
      name: 'Interview Invitation',
      metaTemplateName: 'Candidate Interview Scheduled',
      language: 'en',
      templateType: 'interview_invite',
      category: 'UTILITY',
      bodyTemplate: 'Hello {{1}}, we are pleased to invite you for an interview for the {{2}} position.\n\nDate: {{3}}\nTime: {{4}}\nLocation: {{5}\n\nPlease confirm your availability. Best regards, {{6}}',
      status: 'approved',
    },
    {
      name: 'Status Update',
      metaTemplateName: 'vantahire_status_update',
      language: 'en',
      templateType: 'status_update',
      category: 'UTILITY',
      bodyTemplate: 'Hello {{1}}, your application for {{2}} has been updated to: {{3}}. We will keep you informed of any further updates. Best regards, {{4}}',
      status: 'approved',
    },
    {
      name: 'Offer Extended',
      metaTemplateName: 'Candidate Offer Extend',
      language: 'en',
      templateType: 'offer_extended',
      category: 'UTILITY',
      bodyTemplate: 'Congratulations {{1}}! We are delighted to extend an offer for the {{2}} position at VantaHire. Please check your email for the detailed offer letter. Best regards, {{3}}',
      status: 'approved',
    },
    {
      name: 'Application Update',
      metaTemplateName: 'Candidate Rejection',
      language: 'en',
      templateType: 'rejection',
      category: 'UTILITY',
      bodyTemplate: 'Hello {{1}}, thank you for your interest in the {{2}} position. After careful review, we have decided to move forward with other candidates. We encourage you to apply for future opportunities. Best regards, {{3}}',
      status: 'approved',
    },
  ];

  for (const template of defaultTemplates) {
    // Check if template already exists by TYPE (constant), not name
    const existing = await db.query.whatsappTemplates.findFirst({
      where: eq(whatsappTemplates.templateType, template.templateType)
    });

    if (!existing) {
      await db.insert(whatsappTemplates).values(template);
      console.log(`  ✓ Created WhatsApp template: ${template.name}`);
    } else {
      // Update the existing template to match the new configuration (e.g. name change)
      await db.update(whatsappTemplates)
        .set(template)
        .where(eq(whatsappTemplates.id, existing.id));
      console.log(`  ↻ Updated WhatsApp template: ${template.name} (Campaign: ${template.metaTemplateName})`);
    }
  }

  console.log('✅ WhatsApp templates seeded\n');
}
