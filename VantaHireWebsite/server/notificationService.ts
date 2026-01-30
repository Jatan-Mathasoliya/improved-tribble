/**
 * Unified Notification Service
 * Orchestrates sending both email AND WhatsApp notifications
 * Single entry point for all notification triggers
 */

import {
  sendInterviewInvitation as sendEmailInterviewInvitation,
  sendStatusUpdateEmail,
  sendApplicationReceivedEmail,
  sendOfferEmail,
  sendRejectionEmail,
} from './emailTemplateService';

import {
  sendWhatsAppInterviewInvitation,
  sendWhatsAppStatusUpdate,
  sendWhatsAppApplicationReceived,
  sendWhatsAppOfferNotification,
  sendWhatsAppRejectionNotification,
} from './whatsappTemplateService';

import { db } from './db';
import { applications } from '../shared/schema';
import { eq } from 'drizzle-orm';

export interface NotificationOptions {
  skipEmail?: boolean;
  skipWhatsApp?: boolean;
}

export interface NotificationResult {
  email: { sent: boolean; error?: string };
  whatsapp: { sent: boolean; error?: string };
}

/**
 * Check if notifications are enabled
 */
function isNotificationEnabled(): boolean {
  return (
    process.env.EMAIL_AUTOMATION_ENABLED === 'true' ||
    process.env.EMAIL_AUTOMATION_ENABLED === '1' ||
    process.env.NOTIFICATION_AUTOMATION_ENABLED === 'true' ||
    process.env.NOTIFICATION_AUTOMATION_ENABLED === '1'
  );
}

/**
 * Check if WhatsApp is enabled
 */
function isWhatsAppEnabled(): boolean {
  return (
    process.env.WHATSAPP_ENABLED === 'true' ||
    process.env.WHATSAPP_ENABLED === '1'
  );
}

/**
 * Check if WhatsApp consent is given for an application
 */
async function hasWhatsAppConsent(applicationId: number): Promise<boolean> {
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    columns: { whatsappConsent: true },
  });
  return application?.whatsappConsent ?? false;
}

/**
 * Send application received notification (both email and WhatsApp)
 */
export async function sendApplicationReceivedNotification(
  applicationId: number,
  options: NotificationOptions = {}
): Promise<NotificationResult> {
  const result: NotificationResult = {
    email: { sent: false },
    whatsapp: { sent: false },
  };

  if (!isNotificationEnabled()) {
    return result;
  }

  // Send email
  if (!options.skipEmail) {
    try {
      await sendApplicationReceivedEmail(applicationId);
      result.email.sent = true;
    } catch (error: any) {
      result.email.error = error?.message || 'Unknown error';
      console.error('[Notification] Email failed for application_received:', error);
    }
  }

  // Send WhatsApp (only if consent given)
  if (!options.skipWhatsApp && isWhatsAppEnabled()) {
    const hasConsent = await hasWhatsAppConsent(applicationId);
    if (hasConsent) {
      try {
        await sendWhatsAppApplicationReceived(applicationId);
        result.whatsapp.sent = true;
      } catch (error: any) {
        result.whatsapp.error = error?.message || 'Unknown error';
        console.error('[Notification] WhatsApp failed for application_received:', error);
      }
    } else {
      console.log(`[Notification] WhatsApp skipped for application ${applicationId} - no consent`);
    }
  }

  return result;
}

/**
 * Send interview invitation notification (both email and WhatsApp)
 */
export async function sendInterviewInvitationNotification(
  applicationId: number,
  interviewDetails: {
    date: string;
    time: string;
    location: string;
  },
  options: NotificationOptions = {}
): Promise<NotificationResult> {
  const result: NotificationResult = {
    email: { sent: false },
    whatsapp: { sent: false },
  };

  if (!isNotificationEnabled()) {
    return result;
  }

  // Send email
  if (!options.skipEmail) {
    try {
      await sendEmailInterviewInvitation(applicationId, interviewDetails);
      result.email.sent = true;
    } catch (error: any) {
      result.email.error = error?.message || 'Unknown error';
      console.error('[Notification] Email failed for interview_invite:', error);
    }
  }

  // Send WhatsApp (only if consent given)
  if (!options.skipWhatsApp && isWhatsAppEnabled()) {
    const hasConsent = await hasWhatsAppConsent(applicationId);
    if (hasConsent) {
      try {
        await sendWhatsAppInterviewInvitation(applicationId, interviewDetails);
        result.whatsapp.sent = true;
      } catch (error: any) {
        result.whatsapp.error = error?.message || 'Unknown error';
        console.error('[Notification] WhatsApp failed for interview_invite:', error);
      }
    } else {
      console.log(`[Notification] WhatsApp skipped for application ${applicationId} - no consent`);
    }
  }

  return result;
}

/**
 * Send status update notification (both email and WhatsApp)
 */
export async function sendStatusUpdateNotification(
  applicationId: number,
  newStatus: string,
  options: NotificationOptions = {}
): Promise<NotificationResult> {
  const result: NotificationResult = {
    email: { sent: false },
    whatsapp: { sent: false },
  };

  if (!isNotificationEnabled()) {
    return result;
  }

  // Send email
  if (!options.skipEmail) {
    try {
      await sendStatusUpdateEmail(applicationId, newStatus);
      result.email.sent = true;
    } catch (error: any) {
      result.email.error = error?.message || 'Unknown error';
      console.error('[Notification] Email failed for status_update:', error);
    }
  }

  // Send WhatsApp (only if consent given)
  if (!options.skipWhatsApp && isWhatsAppEnabled()) {
    const hasConsent = await hasWhatsAppConsent(applicationId);
    if (hasConsent) {
      try {
        await sendWhatsAppStatusUpdate(applicationId, newStatus);
        result.whatsapp.sent = true;
      } catch (error: any) {
        result.whatsapp.error = error?.message || 'Unknown error';
        console.error('[Notification] WhatsApp failed for status_update:', error);
      }
    } else {
      console.log(`[Notification] WhatsApp skipped for application ${applicationId} - no consent`);
    }
  }

  return result;
}

/**
 * Send offer notification (both email and WhatsApp)
 */
export async function sendOfferNotification(
  applicationId: number,
  options: NotificationOptions = {}
): Promise<NotificationResult> {
  const result: NotificationResult = {
    email: { sent: false },
    whatsapp: { sent: false },
  };

  if (!isNotificationEnabled()) {
    return result;
  }

  // Send email
  if (!options.skipEmail) {
    try {
      await sendOfferEmail(applicationId);
      result.email.sent = true;
    } catch (error: any) {
      result.email.error = error?.message || 'Unknown error';
      console.error('[Notification] Email failed for offer:', error);
    }
  }

  // Send WhatsApp (only if consent given)
  if (!options.skipWhatsApp && isWhatsAppEnabled()) {
    const hasConsent = await hasWhatsAppConsent(applicationId);
    if (hasConsent) {
      try {
        await sendWhatsAppOfferNotification(applicationId);
        result.whatsapp.sent = true;
      } catch (error: any) {
        result.whatsapp.error = error?.message || 'Unknown error';
        console.error('[Notification] WhatsApp failed for offer:', error);
      }
    } else {
      console.log(`[Notification] WhatsApp skipped for application ${applicationId} - no consent`);
    }
  }

  return result;
}

/**
 * Send rejection notification (both email and WhatsApp)
 */
export async function sendRejectionNotification(
  applicationId: number,
  options: NotificationOptions = {}
): Promise<NotificationResult> {
  const result: NotificationResult = {
    email: { sent: false },
    whatsapp: { sent: false },
  };

  if (!isNotificationEnabled()) {
    return result;
  }

  // Send email
  if (!options.skipEmail) {
    try {
      await sendRejectionEmail(applicationId);
      result.email.sent = true;
    } catch (error: any) {
      result.email.error = error?.message || 'Unknown error';
      console.error('[Notification] Email failed for rejection:', error);
    }
  }

  // Send WhatsApp (only if consent given)
  if (!options.skipWhatsApp && isWhatsAppEnabled()) {
    const hasConsent = await hasWhatsAppConsent(applicationId);
    if (hasConsent) {
      try {
        await sendWhatsAppRejectionNotification(applicationId);
        result.whatsapp.sent = true;
      } catch (error: any) {
        result.whatsapp.error = error?.message || 'Unknown error';
        console.error('[Notification] WhatsApp failed for rejection:', error);
      }
    } else {
      console.log(`[Notification] WhatsApp skipped for application ${applicationId} - no consent`);
    }
  }

  return result;
}
