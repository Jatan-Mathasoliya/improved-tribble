/**
 * Cashfree Payment SDK Integration
 *
 * Uses the Cashfree JS SDK for payment checkout.
 * The SDK is loaded on demand to avoid adding it to the critical path.
 */

declare global {
  interface Window {
    Cashfree: (config: { mode: 'sandbox' | 'production' }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: '_self' | '_blank' | '_top' }) => Promise<{ error?: { message: string }; redirect?: boolean; paymentDetails?: unknown }>;
    };
  }
}

// Determine environment from explicit env variable only
// IMPORTANT: Must match server's CASHFREE_ENV to avoid session ID mismatch
// Set VITE_CASHFREE_ENV=PRODUCTION in production deployments
const CASHFREE_MODE: 'sandbox' | 'production' =
  import.meta.env.VITE_CASHFREE_ENV === 'PRODUCTION' ? 'production' : 'sandbox';
const CASHFREE_SDK_SRC = 'https://sdk.cashfree.com/js/v3/cashfree.js';

let cashfreeSDKPromise: Promise<void> | null = null;

async function loadCashfreeSDK(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Cashfree checkout can only run in the browser.');
  }

  if (typeof window.Cashfree === 'function') {
    return;
  }

  if (cashfreeSDKPromise) {
    return cashfreeSDKPromise;
  }

  cashfreeSDKPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${CASHFREE_SDK_SRC}"]`);

    const handleLoad = () => {
      if (typeof window.Cashfree === 'function') {
        resolve();
        return;
      }
      cashfreeSDKPromise = null;
      reject(new Error('Cashfree SDK loaded but window.Cashfree is unavailable.'));
    };

    const handleError = () => {
      cashfreeSDKPromise = null;
      reject(new Error('Failed to load Cashfree SDK.'));
    };

    if (existingScript) {
      if (typeof window.Cashfree === 'function') {
        resolve();
        return;
      }
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = CASHFREE_SDK_SRC;
    script.async = true;
    script.onload = handleLoad;
    script.onerror = handleError;
    document.head.appendChild(script);
  });

  return cashfreeSDKPromise;
}

/**
 * Initialize Cashfree checkout with payment session ID
 *
 * @param paymentSessionId - The payment_session_id from order creation
 * @param paymentLink - Hosted checkout fallback if the SDK cannot load
 * @returns Promise that resolves when checkout is complete or rejects on error
 */
export async function initiateCashfreeCheckout(paymentSessionId: string, paymentLink?: string): Promise<void> {
  try {
    await loadCashfreeSDK();
  } catch (error) {
    if (paymentLink && typeof window !== 'undefined') {
      window.location.href = paymentLink;
      return;
    }
    throw error instanceof Error
      ? error
      : new Error('Cashfree SDK not loaded. Please refresh the page and try again.');
  }

  console.log('[Cashfree] SDK mode:', CASHFREE_MODE, 'hostname:', window.location.hostname, 'sessionId length:', paymentSessionId.length);

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
