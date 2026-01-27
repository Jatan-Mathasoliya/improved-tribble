/**
 * Cashfree Payment SDK Integration
 *
 * Uses the Cashfree JS SDK for payment checkout.
 * The SDK is loaded via script tag in index.html.
 */

declare global {
  interface Window {
    Cashfree: (config: { mode: 'sandbox' | 'production' }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: '_self' | '_blank' | '_top' }) => Promise<{ error?: { message: string }; redirect?: boolean; paymentDetails?: unknown }>;
    };
  }
}

// Determine environment based on API URL or explicit env variable
const CASHFREE_MODE: 'sandbox' | 'production' =
  import.meta.env.VITE_CASHFREE_ENV === 'PRODUCTION' ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost')
    ? 'production'
    : 'sandbox';

/**
 * Initialize Cashfree checkout with payment session ID
 *
 * @param paymentSessionId - The payment_session_id from order creation
 * @returns Promise that resolves when checkout is complete or rejects on error
 */
export async function initiateCashfreeCheckout(paymentSessionId: string): Promise<void> {
  if (typeof window === 'undefined' || !window.Cashfree) {
    throw new Error('Cashfree SDK not loaded. Please refresh the page and try again.');
  }

  const cashfree = window.Cashfree({
    mode: CASHFREE_MODE,
  });

  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: '_self',
  });

  // If we reach here without redirect, there was an error
  if (result.error) {
    throw new Error(result.error.message || 'Payment checkout failed');
  }
}

/**
 * Check if Cashfree SDK is available
 */
export function isCashfreeSDKLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.Cashfree === 'function';
}
