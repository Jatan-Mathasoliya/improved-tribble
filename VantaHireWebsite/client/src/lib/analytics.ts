declare global {
  interface Window {
    trackingFunctions?: { onLoad: (opts: { appId: string }) => void };
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// Google Analytics 4
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export function loadGoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return;

  try {
    // Avoid duplicate injection
    const exists = Array.from(document.getElementsByTagName('script')).some(
      s => s.src.includes('googletagmanager.com/gtag')
    );
    if (exists) return;

    // Load gtag.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_title: document.title,
      page_location: window.location.href,
    });
  } catch (e) {
    console.warn('Google Analytics injection failed:', e);
  }
}

// Track custom events
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (window.gtag && GA_MEASUREMENT_ID) {
    window.gtag('event', eventName, params);
  }
}

// Track page views (for SPA navigation)
export function trackPageView(path: string, title?: string) {
  if (window.gtag && GA_MEASUREMENT_ID) {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
      page_title: title || document.title,
    });
  }
}

// Apollo Tracker
export function loadApolloTracker(appId: string) {
  if (!appId) return;
  try {
    // Avoid duplicate injection
    const exists = Array.from(document.getElementsByTagName('script')).some(s => s.src.includes('assets.apollo.io/micro/website-tracker'));
    if (exists) return;
    const script = document.createElement('script');
    const nocache = Math.random().toString(36).substring(7);
    script.src = `https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache=${nocache}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        window.trackingFunctions?.onLoad({ appId });
      } catch (e) {
        console.warn('Apollo tracker onLoad failed:', e);
      }
    };
    document.head.appendChild(script);
  } catch (e) {
    console.warn('Apollo tracker injection failed:', e);
  }
}
