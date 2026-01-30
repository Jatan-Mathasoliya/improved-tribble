/**
 * WhatsApp Service
 * Handles sending WhatsApp messages via Meta Business API or test mode
 * Pattern follows simpleEmailService.ts
 */

import { formatToE164, getDefaultCountry } from './lib/phoneUtils';

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document';
    text?: string;
  }>;
}

export interface WhatsAppService {
  sendTemplateMessage(opts: {
    to: string;
    templateName: string;
    languageCode: string;
    parameters: string[]; // Ordered array of parameters matching {{1}}, {{2}}, etc.
  }): Promise<WhatsAppSendResult>;

  validatePhoneNumber(phone: string): { valid: boolean; formatted: string | null };
}

/**
 * Test WhatsApp Service (DEFAULT for local testing)
 * Logs messages to console and returns mock success
 */
export class TestWhatsAppService implements WhatsAppService {
  async sendTemplateMessage(opts: {
    to: string;
    templateName: string;
    languageCode: string;
    parameters: string[];
  }): Promise<WhatsAppSendResult> {
    const formatted = formatToE164(opts.to, getDefaultCountry());

    console.log('\n========================================');
    console.log('[WhatsApp Test] Sending message:');
    console.log('----------------------------------------');
    console.log(`  To: ${opts.to} → ${formatted || 'INVALID'}`);
    console.log(`  Template: ${opts.templateName}`);
    console.log(`  Language: ${opts.languageCode}`);
    console.log(`  Parameters (ordered):`);
    opts.parameters.forEach((param, index) => {
      console.log(`    {{${index + 1}}} = "${param}"`);
    });
    console.log('========================================\n');

    // Simulate success with mock message ID
    const messageId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      messageId,
    };
  }

  validatePhoneNumber(phone: string): { valid: boolean; formatted: string | null } {
    const formatted = formatToE164(phone, getDefaultCountry());
    return {
      valid: formatted !== null,
      formatted,
    };
  }
}

/**
 * Meta WhatsApp Business API Service (Production)
 * Uses the official Meta Graph API to send WhatsApp messages
 */
export class MetaWhatsAppService implements WhatsAppService {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;

  constructor(opts: {
    accessToken: string;
    phoneNumberId: string;
    apiVersion?: string;
  }) {
    this.accessToken = opts.accessToken;
    this.phoneNumberId = opts.phoneNumberId;
    this.apiVersion = opts.apiVersion || 'v18.0';
  }

  async sendTemplateMessage(opts: {
    to: string;
    templateName: string;
    languageCode: string;
    parameters: string[];
  }): Promise<WhatsAppSendResult> {
    const formatted = formatToE164(opts.to, getDefaultCountry());

    if (!formatted) {
      return {
        success: false,
        error: {
          code: 'INVALID_PHONE',
          message: `Invalid phone number: ${opts.to}`,
        },
      };
    }

    // Build template components from ordered parameters array
    // Parameters map directly to {{1}}, {{2}}, {{3}}, etc. in the template
    const components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }> = [];

    if (opts.parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: opts.parameters.map((text) => ({
          type: 'text',
          text: text || '',
        })),
      });
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formatted.replace('+', ''), // Meta API expects number without +
      type: 'template',
      template: {
        name: opts.templateName,
        language: {
          code: opts.languageCode,
        },
        components,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as {
        messages?: Array<{ id: string }>;
        error?: { code: number; message: string };
      };

      if (!response.ok) {
        console.error('[WhatsApp Meta] API error:', data);
        return {
          success: false,
          error: {
            code: String(data.error?.code || response.status),
            message: data.error?.message || 'Unknown error',
          },
        };
      }

      const messageId = data.messages?.[0]?.id || `meta-${Date.now()}`;
      console.log(`[WhatsApp Meta] Message sent successfully: ${messageId}`);

      return {
        success: true,
        messageId,
      } as const;
    } catch (error: any) {
      console.error('[WhatsApp Meta] Network error:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error?.message || 'Network error',
        },
      };
    }
  }

  validatePhoneNumber(phone: string): { valid: boolean; formatted: string | null } {
    const formatted = formatToE164(phone, getDefaultCountry());
    return {
      valid: formatted !== null,
      formatted,
    };
  }
}

/**
 * AiSensy WhatsApp Service
 * Uses AiSensy API to send WhatsApp messages
 * API Docs: https://docs.aisensy.com/
 */
export class AiSensyWhatsAppService implements WhatsAppService {
  private apiKey: string;
  private endpoint = 'https://backend.aisensy.com/campaign/t1/api/v2';

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async sendTemplateMessage(opts: {
    to: string;
    templateName: string;
    languageCode: string;
    parameters: string[];
  }): Promise<WhatsAppSendResult> {
    const formatted = formatToE164(opts.to, getDefaultCountry());

    if (!formatted) {
      return {
        success: false,
        error: {
          code: 'INVALID_PHONE',
          message: `Invalid phone number: ${opts.to}`,
        },
      };
    }

    // AiSensy requires userName - extract from first parameter (candidate_name)
    const userName = opts.parameters[0] || 'User';

    const body = {
      apiKey: this.apiKey,
      campaignName: opts.templateName, // templateName maps to campaignName in AiSensy
      destination: formatted, // AiSensy expects number with + prefix
      userName: userName,
      templateParams: opts.parameters,
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as {
        status?: string;
        message?: string;
        id?: string;
        error?: string;
      };

      if (!response.ok || data.status === 'error') {
        console.error('[WhatsApp AiSensy] API error:', data);
        return {
          success: false,
          error: {
            code: String(response.status),
            message: data.message || data.error || 'Unknown error',
          },
        };
      }

      const messageId = data.id || `aisensy-${Date.now()}`;
      console.log(`[WhatsApp AiSensy] Message sent successfully: ${messageId}`);

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      console.error('[WhatsApp AiSensy] Network error:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error?.message || 'Network error',
        },
      };
    }
  }

  validatePhoneNumber(phone: string): { valid: boolean; formatted: string | null } {
    const formatted = formatToE164(phone, getDefaultCountry());
    return {
      valid: formatted !== null,
      formatted,
    };
  }
}

// Singleton instance
let whatsappServiceInstance: WhatsAppService | null = null;

/**
 * Get WhatsApp service instance (singleton factory pattern)
 * Returns TestWhatsAppService by default, MetaWhatsAppService when configured
 */
export async function getWhatsAppService(): Promise<WhatsAppService | null> {
  // Check if WhatsApp is enabled
  const enabled = process.env.WHATSAPP_ENABLED === 'true' || process.env.WHATSAPP_ENABLED === '1';
  if (!enabled) {
    console.log('[WhatsApp] WhatsApp notifications disabled');
    return null;
  }

  // Return cached instance
  if (whatsappServiceInstance) {
    return whatsappServiceInstance;
  }

  const provider = (process.env.WHATSAPP_PROVIDER || 'test').toLowerCase();

  if (provider === 'meta') {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';

    if (!accessToken || !phoneNumberId) {
      console.warn('[WhatsApp] Meta API not configured. Falling back to test service.');
      console.log('[WhatsApp] Using TestWhatsAppService (messages logged to console)');
      whatsappServiceInstance = new TestWhatsAppService();
      return whatsappServiceInstance;
    }

    console.log('[WhatsApp] Using MetaWhatsAppService (production)');
    whatsappServiceInstance = new MetaWhatsAppService({
      accessToken,
      phoneNumberId,
      apiVersion,
    });
    return whatsappServiceInstance;
  }

  if (provider === 'aisensy') {
    const apiKey = process.env.AISENSY_API_KEY;

    if (!apiKey) {
      console.warn('[WhatsApp] AiSensy API key not configured. Falling back to test service.');
      console.log('[WhatsApp] Using TestWhatsAppService (messages logged to console)');
      whatsappServiceInstance = new TestWhatsAppService();
      return whatsappServiceInstance;
    }

    console.log('[WhatsApp] Using AiSensyWhatsAppService');
    whatsappServiceInstance = new AiSensyWhatsAppService({ apiKey });
    return whatsappServiceInstance;
  }

  // Default: Test service
  console.log('[WhatsApp] Using TestWhatsAppService (messages logged to console)');
  whatsappServiceInstance = new TestWhatsAppService();
  return whatsappServiceInstance;
}
