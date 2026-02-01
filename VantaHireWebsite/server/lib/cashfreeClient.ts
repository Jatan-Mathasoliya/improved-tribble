import crypto from "crypto";
import {
  type Organization,
  type SubscriptionPlan,
  type BillingCycle,
} from "@shared/schema";

// Cashfree configuration
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || '';
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || '';
const CASHFREE_WEBHOOK_SECRET = process.env.CASHFREE_WEBHOOK_SECRET || '';
const CASHFREE_ENV = process.env.CASHFREE_ENV || 'SANDBOX';

// GST configuration
const GST_RATE = parseInt(process.env.GST_RATE || '18', 10);

// API Base URLs
const API_BASE_URL = CASHFREE_ENV === 'PRODUCTION'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com';

function sanitizePaymentSessionId(sessionId: string | undefined): string {
  // Cashfree session IDs may end with 'paymentpayment' - this is VALID and should NOT be removed.
  // The suffix appears to be part of Cashfree's internal encoding.
  // Removing it causes "payment_session_id_invalid" errors.
  return sessionId || '';
}

// Types for Cashfree API
export interface CashfreeOrder {
  orderId: string;
  orderAmount: number;
  orderCurrency: string;
  orderStatus: string;
  paymentSessionId: string;
  orderMeta?: {
    returnUrl?: string;
    notifyUrl?: string;
  };
}

export interface CashfreePaymentLink {
  linkId: string;
  linkUrl: string;
  linkStatus: string;
  linkAmount: number;
}

export interface CashfreeWebhookPayload {
  // Standard format (2023-08-01 and 2025-01-01)
  type?: string;
  event_time?: string;
  data?: {
    order?: {
      order_id: string;
      order_amount: number;
      order_currency: string;
      order_status?: string;
      order_tags?: Record<string, string> | null;
    };
    payment?: {
      cf_payment_id: string;
      payment_status: string;
      payment_amount: number;
      payment_currency?: string;
      payment_message?: string;
      payment_time?: string;
      bank_reference?: string;
      payment_group?: string; // "upi", "card", "netbanking", etc.
      payment_method?: {
        payment_method_type?: string;
        upi?: { channel?: string; upi_id?: string };
        card?: { card_number?: string; card_network?: string };
        netbanking?: { channel?: string; netbanking_bank_name?: string };
      };
    };
    customer_details?: {
      customer_id?: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
    };
    error_details?: {
      error_code?: string;
      error_description?: string;
      error_reason?: string;
      error_source?: string;
    };
    subscription?: {
      subscription_id: string;
      status: string;
    };
  };
  // Legacy format fields (fallback)
  event_type?: string;
  order_id?: string;
  cf_order_id?: string;
}

// Helper: Make API request to Cashfree
async function cashfreeRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-version': '2023-08-01',
    'x-client-id': CASHFREE_APP_ID,
    'x-client-secret': CASHFREE_SECRET_KEY,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cashfree API error:', response.status, errorText);
    throw new Error(`Cashfree API error: ${response.status} ${errorText}`);
  }

  return response.json() as T;
}

// Calculate price with GST
export function calculatePriceWithGST(
  baseAmount: number, // in paise
  includeGST: boolean = true
): {
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
} {
  if (!includeGST) {
    // Price is inclusive of GST, extract GST component
    const gstAmount = Math.round(baseAmount * GST_RATE / (100 + GST_RATE));
    return {
      baseAmount: baseAmount - gstAmount,
      gstAmount,
      totalAmount: baseAmount,
    };
  }

  // Add GST to base amount
  const gstAmount = Math.round(baseAmount * GST_RATE / 100);
  return {
    baseAmount,
    gstAmount,
    totalAmount: baseAmount + gstAmount,
  };
}

// Create checkout order for subscription
export async function createCheckoutOrder(
  organization: Organization,
  plan: SubscriptionPlan,
  seats: number,
  billingCycle: BillingCycle,
  customerEmail: string,
  customerPhone?: string,
  returnUrl?: string
): Promise<{
  orderId: string;
  sessionId: string;
  paymentLink: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
}> {
  const pricePerSeat = billingCycle === 'annual'
    ? plan.pricePerSeatAnnual
    : plan.pricePerSeatMonthly;

  const baseAmount = pricePerSeat * seats;

  // If organization has GSTIN, show GST separately
  // Otherwise, price is tax-inclusive
  const hasGSTIN = !!organization.gstin;
  const pricing = calculatePriceWithGST(baseAmount, hasGSTIN);

  const orderId = `ORD_${organization.id}_${Date.now()}`;

  const orderRequest = {
    order_id: orderId,
    order_amount: pricing.totalAmount / 100, // Convert paise to rupees
    order_currency: 'INR',
    customer_details: {
      customer_id: `ORG_${organization.id}`,
      customer_email: customerEmail,
      customer_phone: customerPhone || '9999999999', // Fallback
      customer_name: organization.billingName || organization.name,
    },
    order_meta: {
      return_url: returnUrl || `${process.env.APP_URL}/settings/billing?order_id={order_id}`,
      notify_url: `${process.env.APP_URL}/api/webhooks/cashfree`,
    },
    order_note: `${plan.displayName} plan - ${seats} seat(s) - ${billingCycle}`,
    order_tags: {
      organization_id: String(organization.id),
      plan_id: String(plan.id),
      seats: String(seats),
      billing_cycle: billingCycle,
    },
  };

  const response = await cashfreeRequest<{
    cf_order_id: string;
    order_id: string;
    payment_session_id: string;
    order_status: string;
  }>('/pg/orders', 'POST', orderRequest);

  console.log('Cashfree order created:', {
    orderId: response.order_id,
    cfOrderId: response.cf_order_id,
    sessionId: response.payment_session_id,
    sessionIdLength: response.payment_session_id?.length,
  });

  const sanitizedSessionId = sanitizePaymentSessionId(response.payment_session_id);

  // Get payment link - use Cashfree's hosted checkout page
  // API v2023-08-01 format: use payment_session_id with proper checkout URL
  const paymentLink = CASHFREE_ENV === 'PRODUCTION'
    ? `https://payments.cashfree.com/pg/orders/pay?payment_session_id=${sanitizedSessionId}`
    : `https://sandbox.cashfree.com/pg/orders/pay?payment_session_id=${sanitizedSessionId}`;

  console.log('Payment link generated:', paymentLink, 'cf_order_id:', response.cf_order_id);

  return {
    orderId: response.order_id,
    sessionId: sanitizedSessionId,
    paymentLink,
    amount: pricing.baseAmount,
    taxAmount: pricing.gstAmount,
    totalAmount: pricing.totalAmount,
  };
}

// Get order status
export async function getOrderStatus(orderId: string): Promise<{
  status: string;
  paymentId?: string;
  paymentMethod?: string;
}> {
  const response = await cashfreeRequest<{
    order_status: string;
    cf_payment_id?: string;
    payment_method?: {
      payment_method_type: string;
    };
  }>(`/pg/orders/${orderId}`);

  const result: { status: string; paymentId?: string; paymentMethod?: string } = {
    status: response.order_status,
  };
  if (response.cf_payment_id) {
    result.paymentId = response.cf_payment_id;
  }
  if (response.payment_method?.payment_method_type) {
    result.paymentMethod = response.payment_method.payment_method_type;
  }
  return result;
}

// Get payment details
export async function getPaymentDetails(orderId: string): Promise<{
  payments: {
    paymentId: string;
    status: string;
    amount: number;
    method: string;
  }[];
}> {
  const response = await cashfreeRequest<{
    cf_payment_id: string;
    payment_status: string;
    payment_amount: number;
    payment_method: {
      payment_method_type: string;
    };
  }[]>(`/pg/orders/${orderId}/payments`);

  return {
    payments: response.map(p => ({
      paymentId: p.cf_payment_id,
      status: p.payment_status,
      amount: p.payment_amount,
      method: p.payment_method?.payment_method_type,
    })),
  };
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', CASHFREE_WEBHOOK_SECRET)
    .update(timestamp + payload)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Parse webhook event - handles both v2023-08-01 format and 2025-01-01 formats
export function parseWebhookEvent(payload: CashfreeWebhookPayload): {
  eventType: string;
  eventId: string;
  orderId?: string;
  paymentId?: string;
  paymentStatus?: string;
  paymentAmount?: number;
  paymentMethod?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  errorReason?: string;
} {
  // Handle different event type field names
  const eventType = payload.type || payload.event_type || 'UNKNOWN';

  // Extract identifiers for deterministic event ID
  // IMPORTANT: Use merchant order_id, NOT cf_order_id (Cashfree's internal ID)
  // Our transaction lookup uses merchant order_id (e.g., ORD_246_xxx)
  const orderId = payload.data?.order?.order_id || payload.order_id || '';
  const cfOrderId = payload.cf_order_id || ''; // For event ID uniqueness only
  const paymentId = payload.data?.payment?.cf_payment_id || '';
  const subscriptionId = payload.data?.subscription?.subscription_id || '';

  // Generate deterministic event ID for idempotency
  // Use combination of event_type + order_id + payment_id to ensure retries are deduplicated
  const eventId = crypto
    .createHash('sha256')
    .update(`${eventType}:${orderId}:${paymentId}:${subscriptionId}`)
    .digest('hex')
    .substring(0, 32);

  const result: {
    eventType: string;
    eventId: string;
    orderId?: string;
    paymentId?: string;
    paymentStatus?: string;
    paymentAmount?: number;
    paymentMethod?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    errorReason?: string;
  } = {
    eventType,
    eventId,
    ...(orderId ? { orderId } : {}),
    ...(paymentId ? { paymentId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
  };

  // Extract additional payment/subscription details
  const payment = payload.data?.payment;
  const subscription = payload.data?.subscription;
  const errorDetails = payload.data?.error_details;
  if (payment?.payment_status) {
    result.paymentStatus = payment.payment_status;
  }
  if (payment?.payment_amount !== undefined) {
    // Convert to paise if it's in rupees (Cashfree sends in rupees)
    result.paymentAmount = payment.payment_amount * 100;
  }
  // Payment method: prefer payment_group, fallback to payment_method_type
  if (payment?.payment_group) {
    result.paymentMethod = payment.payment_group;
  } else if (payment?.payment_method?.payment_method_type) {
    result.paymentMethod = payment.payment_method.payment_method_type;
  }
  if (subscription?.status) {
    result.subscriptionStatus = subscription.status;
  }

  // Extract error details for failed payments
  if (errorDetails) {
    const parts = [
      errorDetails.error_reason,
      errorDetails.error_description,
      errorDetails.error_code,
    ].filter(Boolean);
    if (parts.length > 0) {
      result.errorReason = parts.join(' - ');
    }
  }

  return result;
}

// Create refund
export async function createRefund(
  orderId: string,
  amount: number, // in rupees
  reason: string
): Promise<{
  refundId: string;
  status: string;
}> {
  const refundId = `REF_${orderId}_${Date.now()}`;

  const response = await cashfreeRequest<{
    cf_refund_id: string;
    refund_status: string;
  }>(`/pg/orders/${orderId}/refunds`, 'POST', {
    refund_id: refundId,
    refund_amount: amount,
    refund_note: reason,
  });

  return {
    refundId: response.cf_refund_id,
    status: response.refund_status,
  };
}

// Create checkout order for seat addition (prorated)
export async function createSeatAddCheckout(
  organization: Organization,
  subscriptionId: number,
  additionalSeats: number,
  proratedAmount: number, // in paise
  customerEmail: string,
  customerPhone?: string,
  returnUrl?: string
): Promise<{
  orderId: string;
  sessionId: string;
  paymentLink: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
}> {
  // If organization has GSTIN, show GST separately
  // Otherwise, price is tax-inclusive
  const hasGSTIN = !!organization.gstin;
  const pricing = calculatePriceWithGST(proratedAmount, hasGSTIN);

  const orderId = `SEAT_${organization.id}_${Date.now()}`;

  const orderRequest = {
    order_id: orderId,
    order_amount: pricing.totalAmount / 100, // Convert paise to rupees
    order_currency: 'INR',
    customer_details: {
      customer_id: `ORG_${organization.id}`,
      customer_email: customerEmail,
      customer_phone: customerPhone || '9999999999', // Fallback
      customer_name: organization.billingName || organization.name,
    },
    order_meta: {
      return_url: returnUrl || `${process.env.APP_URL}/settings/billing?order_id={order_id}`,
      notify_url: `${process.env.APP_URL}/api/webhooks/cashfree`,
    },
    order_note: `Add ${additionalSeats} seat(s) - Prorated`,
    order_tags: {
      organization_id: String(organization.id),
      subscription_id: String(subscriptionId),
      additional_seats: String(additionalSeats),
      type: 'seat_addition',
    },
  };

  const response = await cashfreeRequest<{
    cf_order_id: string;
    order_id: string;
    order_status: string;
    payment_session_id: string;
  }>('/pg/orders', 'POST', orderRequest);

  const sanitizedSessionId = sanitizePaymentSessionId(response.payment_session_id);

  // Get payment link - use Cashfree's hosted checkout page
  const paymentLink = CASHFREE_ENV === 'PRODUCTION'
    ? `https://payments.cashfree.com/pg/orders/pay?payment_session_id=${sanitizedSessionId}`
    : `https://sandbox.cashfree.com/pg/orders/pay?payment_session_id=${sanitizedSessionId}`;

  return {
    orderId: response.order_id,
    sessionId: sanitizedSessionId,
    paymentLink,
    amount: pricing.baseAmount,
    taxAmount: pricing.gstAmount,
    totalAmount: pricing.totalAmount,
  };
}

// Check if Cashfree is configured
export function isCashfreeConfigured(): boolean {
  return !!(CASHFREE_APP_ID && CASHFREE_SECRET_KEY);
}

// Get supported payment methods
export function getSupportedPaymentMethods(): string[] {
  return ['upi', 'card', 'netbanking'];
}
