import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import { generateJobPostingSchema, stripHtml } from "./seoUtils";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Detect crawler/bot user agents that benefit from SSR content.
 * Real users get fast CSR (no hydration cost); bots get full SSR for indexing.
 */
const BOT_UA_PATTERN = /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|linkedinbot|twitterbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|perplexitybot|chatgpt-user|ia_archiver|archive\.org_bot/i;

function isCrawler(req: express.Request): boolean {
  const ua = req.headers['user-agent'] || '';
  return BOT_UA_PATTERN.test(ua);
}

/**
 * Inject SSR-rendered HTML into the root div.
 * Adds data-ssr attribute so the client knows to hydrate instead of full render.
 */
function injectSSR(html: string, ssrHtml: string): string {
  if (!ssrHtml) return html;
  return html.replace(
    '<div id="root"></div>',
    `<div id="root" data-ssr="true">${ssrHtml}</div>`,
  );
}

export async function setupVite(app: Express, server: Server) {
  // Compute dirname in ESM
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteConfig = (await import("../vite.config"))?.default ?? {};
  const viteLogger = createLogger();
  const port = Number(process.env.PORT) || 5000;
  const serverOptions: any = {
    middlewareMode: true,
    hmr: { server, port },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Serve static HTML files from client/public (e.g., landing pages)
  // These bypass SPA routing
  const publicDir = path.resolve(__dirname, "..", "client", "public");
  app.use(express.static(publicDir, {
    extensions: ['html'],
    index: false, // Don't serve index.html for directories
  }));

  // SSR meta injection for marketing pages (dev mode)
  const MARKETING_PAGES_DEV: Record<string, { title: string; description: string; canonical: string; keywords?: string; jsonLd?: object[] }> = {
    '/': {
      title: 'VantaHire - Human Decisions, AI Acceleration | AI-Native Recruiting Platform',
      description: 'The AI-native recruiting platform that helps startups and recruiting firms find, rank, and engage the right candidates faster. AI sourcing, WhatsApp outreach, client portal, and pipeline management in one platform.',
      canonical: 'https://vantahire.com/',
      keywords: 'AI recruiting platform, AI-native ATS, AI candidate sourcing, WhatsApp recruitment outreach, recruiting pipeline management, India APAC hiring',
    },
    '/product': {
      title: 'How VantaHire Works | AI Sourcing, Pipeline, Outreach in One Platform',
      description: 'Three layers. One platform. AI sourcing engine, recruiter workflow, and candidate memory system — from candidate discovery to client feedback without switching tools.',
      canonical: 'https://vantahire.com/product',
      keywords: 'AI sourcing engine, resume knowledge graph, recruiter pipeline, candidate discovery, WhatsApp outreach tool, client feedback portal',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Product", "item": "https://vantahire.com/product" }] }],
    },
    '/features': {
      title: 'Features | VantaHire - Six Pillars of AI-Native Recruiting',
      description: 'Resume Knowledge Graph, AI Candidate Discovery, WhatsApp + Email Outreach, Client Feedback Portal, Recruiter Dashboard, and Job Command Center. All the capabilities recruiters need.',
      canonical: 'https://vantahire.com/features',
      keywords: 'resume knowledge graph, AI candidate discovery, WhatsApp email outreach, client feedback portal, recruiter dashboard, job command center',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://vantahire.com/features" }] }],
    },
    '/pricing': {
      title: 'Pricing | VantaHire - Simple, Transparent Pricing',
      description: 'Simple pricing. No surprises. Start free, upgrade when your team grows. AI sourcing, WhatsApp outreach, client portal, and pipeline management included.',
      canonical: 'https://vantahire.com/pricing',
      keywords: 'VantaHire pricing, ATS pricing India, recruiting software cost, free ATS plan, Growth plan pricing, enterprise recruiting platform',
      jsonLd: [
        { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://vantahire.com/pricing" }] },
      ],
    },
    '/compare': {
      title: 'Compare | VantaHire vs Complex ATS Platforms',
      description: 'See how VantaHire compares to legacy ATS platforms. Faster setup, recruiter-first design, and AI acceleration without the complexity.',
      canonical: 'https://vantahire.com/compare',
      keywords: 'ATS comparison, VantaHire vs Greenhouse, VantaHire vs Lever, best ATS for startups, AI recruiting comparison',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Compare", "item": "https://vantahire.com/compare" }] }],
    },
    '/use-cases': {
      title: 'Use Cases | VantaHire - Built for Teams Like Yours',
      description: 'Discover how consulting firms, staffing agencies, startups, and enterprise teams use VantaHire to hire faster across India and APAC.',
      canonical: 'https://vantahire.com/use-cases',
      keywords: 'recruiting use cases, staffing agency ATS, startup hiring platform, enterprise recruiting, APAC recruitment tool',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Use Cases", "item": "https://vantahire.com/use-cases" }] }],
    },
    '/about': {
      title: 'About Us | VantaHire - AI + Human Expertise for Better Hiring',
      description: 'VantaHire combines AI acceleration with human expertise to make recruiting faster and fairer. Learn about our mission, team, and vision.',
      canonical: 'https://vantahire.com/about',
      keywords: 'VantaHire team, about VantaHire, AI recruiting company, Bangalore startup, recruiting technology mission',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "About", "item": "https://vantahire.com/about" }] }],
    },
    '/jobs': {
      title: 'Browse Jobs | VantaHire - Find Your Next Role',
      description: 'Browse open positions across technology, consulting, and more. Apply directly through VantaHire\'s recruiter-first platform.',
      canonical: 'https://vantahire.com/jobs',
      keywords: 'jobs India, tech jobs Bangalore, IT jobs APAC, apply online, VantaHire jobs',
    },
    '/recruiters': {
      title: 'Recruiters Directory | VantaHire',
      description: 'Meet VantaHire\'s specialist recruiters. Industry experts in IT, telecom, automotive, fintech, and healthcare hiring across India and APAC.',
      canonical: 'https://vantahire.com/recruiters',
      keywords: 'specialist recruiters India, IT recruiters, telecom recruiters, healthcare recruiters APAC',
    },
    '/brand': {
      title: 'Brand Assets | VantaHire',
      description: 'Download VantaHire logos, brand guidelines, and media assets. Everything you need for press, partnerships, and co-marketing.',
      canonical: 'https://vantahire.com/brand',
    },
    '/privacy-policy': {
      title: 'Privacy Policy | VantaHire',
      description: 'How VantaHire collects, uses, and protects your data. Read our privacy policy covering candidate data, recruiter data, and platform usage.',
      canonical: 'https://vantahire.com/privacy-policy',
    },
    '/terms-of-service': {
      title: 'Terms of Service | VantaHire',
      description: 'Terms and conditions for using the VantaHire recruiting platform. Covers account usage, data ownership, and service agreements.',
      canonical: 'https://vantahire.com/terms-of-service',
    },
    '/cookie-policy': {
      title: 'Cookie Policy | VantaHire',
      description: 'How VantaHire uses cookies and similar technologies. Learn about the cookies we use and how to manage your preferences.',
      canonical: 'https://vantahire.com/cookie-policy',
    },
  };

  // Routes that should receive SSR body rendering in dev mode
  const SSR_ROUTES = new Set(Object.keys(MARKETING_PAGES_DEV));

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      // Inject marketing page meta in dev mode
      const pageMeta = MARKETING_PAGES_DEV[url];
      if (pageMeta) {
        const baseUrl = (process.env.BASE_URL || 'https://vantahire.com').replace(/\/$/, '');
        template = upsertTitle(template, pageMeta.title);
        template = upsertMetaTag(template, 'name', 'title', pageMeta.title);
        template = upsertMetaTag(template, 'name', 'description', pageMeta.description);
        if (pageMeta.keywords) {
          template = upsertMetaTag(template, 'name', 'keywords', pageMeta.keywords);
        }
        template = upsertLinkRel(template, 'canonical', pageMeta.canonical);
        template = upsertMetaTag(template, 'property', 'og:title', pageMeta.title);
        template = upsertMetaTag(template, 'property', 'og:description', pageMeta.description);
        template = upsertMetaTag(template, 'property', 'og:url', pageMeta.canonical);
        template = upsertMetaTag(template, 'property', 'og:type', 'website');
        template = upsertMetaTag(template, 'property', 'og:image', `${baseUrl}/og-image.jpg`);
        template = upsertMetaTag(template, 'name', 'twitter:card', 'summary_large_image');
        template = upsertMetaTag(template, 'name', 'twitter:url', pageMeta.canonical);
        template = upsertMetaTag(template, 'name', 'twitter:title', pageMeta.title);
        template = upsertMetaTag(template, 'name', 'twitter:description', pageMeta.description);
        template = upsertMetaTag(template, 'name', 'twitter:image', `${baseUrl}/twitter-image.jpg`);
        // Inject page-specific JSON-LD schemas (BreadcrumbList, FAQPage, etc.)
        if (pageMeta.jsonLd) {
          for (const schema of pageMeta.jsonLd) {
            template = injectJsonLd(template, schema);
          }
        }
      }

      // SSR body render for public routes (dev mode) — only for crawlers
      const isSSRRoute = SSR_ROUTES.has(url) || url.startsWith('/jobs/') || url.startsWith('/recruiters/');
      if (isSSRRoute && isCrawler(req)) {
        try {
          const ssrModule = await vite.ssrLoadModule('/src/entry-server.tsx');
          const { html: ssrHtml } = ssrModule.render(url);
          if (ssrHtml) {
            template = injectSSR(template, ssrHtml);
          }
        } catch (ssrError) {
          console.error('[SSR Dev] Render error:', ssrError);
          // Fall through to CSR — page still works, just without SSR content
        }
      }

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

/**
 * Inject JSON-LD structured data into HTML for SEO
 */
function injectJsonLd(html: string, jsonLd: object, schemaType?: string): string {
  const dataAttr = schemaType ? ` data-schema="${schemaType}"` : '';
  const script = `<script type="application/ld+json"${dataAttr}>${JSON.stringify(jsonLd)}</script>`;
  // Inject before </head> for early discovery by crawlers
  return html.replace('</head>', `${script}\n</head>`);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function upsertMetaTag(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta\\s+[^>]*${attr}=["']${escapedKey}["'][^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escapeHtmlAttr(content)}" />`;
  if (regex.test(html)) {
    return html.replace(regex, tag);
  }
  return html.replace('</head>', `${tag}\n</head>`);
}

function upsertLinkRel(html: string, rel: string, href: string): string {
  const escapedRel = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<link\\s+[^>]*rel=["']${escapedRel}["'][^>]*>`, 'i');
  const tag = `<link rel="${rel}" href="${escapeHtmlAttr(href)}" />`;
  if (regex.test(html)) {
    return html.replace(regex, tag);
  }
  return html.replace('</head>', `${tag}\n</head>`);
}

function upsertTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtmlText(title)}</title>`;
  if (/<title>.*<\/title>/i.test(html)) {
    return html.replace(/<title>.*<\/title>/i, tag);
  }
  return html.replace('</head>', `${tag}\n</head>`);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Parse job identifier from URL path (supports slug, id, or legacy id-slug format)
 */
function parseJobIdentifier(param: string): { type: 'id' | 'slug'; value: string | number } {
  // Pure numeric ID
  if (/^\d+$/.test(param)) {
    return { type: 'id', value: Number(param) };
  }
  // Legacy format: id-slug (e.g., "123-senior-engineer")
  const idSlugMatch = param.match(/^(\d+)-(.+)$/);
  if (idSlugMatch) {
    return { type: 'id', value: Number(idSlugMatch[1]) };
  }
  // Pure slug
  return { type: 'slug', value: param };
}

export async function serveStatic(app: Express) {
  // Compute dirname in ESM
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "public");
  const clientPublicPath = path.resolve(__dirname, "..", "client", "public");

  // Strip trailing slashes with 301 redirect (prevents duplicate content)
  app.use((req, res, next) => {
    if (req.path !== '/' && req.path.endsWith('/') && !req.path.startsWith('/api/')) {
      const cleanPath = req.path.replace(/\/+$/, '') + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
      res.redirect(301, cleanPath);
      return;
    }
    next();
  });

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Load SSR render module (built by `vite build --ssr`)
  type SSRRender = (url: string, initialData?: Record<string, unknown>) => { html: string; helmetContext: any };
  let ssrRender: SSRRender | null = null;
  try {
    const ssrModulePath = path.resolve(__dirname, 'server', 'entry-server.js');
    if (fs.existsSync(ssrModulePath)) {
      const ssrModule = await import(pathToFileURL(ssrModulePath).href);
      ssrRender = ssrModule.render;
      log('SSR module loaded successfully', 'ssr');
    } else {
      log('SSR module not found at ' + ssrModulePath + ', falling back to CSR', 'ssr');
    }
  } catch (err) {
    console.warn('[SSR] Failed to load SSR module, falling back to CSR:', err);
  }

  // SSR meta injection for marketing pages (registered before static middleware
  // to prevent express.static from intercepting routes that match directories
  // like /brand which has a physical client/public/brand/ directory)
  const MARKETING_PAGES: Record<string, { title: string; description: string; canonical: string; keywords?: string; jsonLd?: object[] }> = {
    '/': {
      title: 'VantaHire - Human Decisions, AI Acceleration | AI-Native Recruiting Platform',
      description: 'The AI-native recruiting platform that helps startups and recruiting firms find, rank, and engage the right candidates faster. AI sourcing, WhatsApp outreach, client portal, and pipeline management in one platform.',
      canonical: 'https://vantahire.com/',
      keywords: 'AI recruiting platform, AI-native ATS, AI candidate sourcing, WhatsApp recruitment outreach, recruiting pipeline management, India APAC hiring',
    },
    '/product': {
      title: 'How VantaHire Works | AI Sourcing, Pipeline, Outreach in One Platform',
      description: 'Three layers. One platform. AI sourcing engine, recruiter workflow, and candidate memory system — from candidate discovery to client feedback without switching tools.',
      canonical: 'https://vantahire.com/product',
      keywords: 'AI sourcing engine, resume knowledge graph, recruiter pipeline, candidate discovery, WhatsApp outreach tool, client feedback portal',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Product", "item": "https://vantahire.com/product" }] }],
    },
    '/features': {
      title: 'Features | VantaHire - Six Pillars of AI-Native Recruiting',
      description: 'Resume Knowledge Graph, AI Candidate Discovery, WhatsApp + Email Outreach, Client Feedback Portal, Recruiter Dashboard, and Job Command Center. All the capabilities recruiters need.',
      canonical: 'https://vantahire.com/features',
      keywords: 'resume knowledge graph, AI candidate discovery, WhatsApp email outreach, client feedback portal, recruiter dashboard, job command center',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://vantahire.com/features" }] }],
    },
    '/pricing': {
      title: 'Pricing | VantaHire - Simple, Transparent Pricing',
      description: 'Simple pricing. No surprises. Start free, upgrade when your team grows. AI sourcing, WhatsApp outreach, client portal, and pipeline management included.',
      canonical: 'https://vantahire.com/pricing',
      keywords: 'VantaHire pricing, ATS pricing India, recruiting software cost, free ATS plan, Growth plan pricing, enterprise recruiting platform',
      jsonLd: [
        { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://vantahire.com/pricing" }] },
      ],
    },
    '/compare': {
      title: 'Compare | VantaHire vs Complex ATS Platforms',
      description: 'See how VantaHire compares to legacy ATS platforms. Faster setup, recruiter-first design, and AI acceleration without the complexity.',
      canonical: 'https://vantahire.com/compare',
      keywords: 'ATS comparison, VantaHire vs Greenhouse, VantaHire vs Lever, best ATS for startups, AI recruiting comparison',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Compare", "item": "https://vantahire.com/compare" }] }],
    },
    '/use-cases': {
      title: 'Use Cases | VantaHire - Built for Teams Like Yours',
      description: 'Discover how consulting firms, staffing agencies, startups, and enterprise teams use VantaHire to hire faster across India and APAC.',
      canonical: 'https://vantahire.com/use-cases',
      keywords: 'recruiting use cases, staffing agency ATS, startup hiring platform, enterprise recruiting, APAC recruitment tool',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "Use Cases", "item": "https://vantahire.com/use-cases" }] }],
    },
    '/about': {
      title: 'About Us | VantaHire - AI + Human Expertise for Better Hiring',
      description: 'VantaHire combines AI acceleration with human expertise to make recruiting faster and fairer. Learn about our mission, team, and vision.',
      canonical: 'https://vantahire.com/about',
      keywords: 'VantaHire team, about VantaHire, AI recruiting company, Bangalore startup, recruiting technology mission',
      jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" }, { "@type": "ListItem", "position": 2, "name": "About", "item": "https://vantahire.com/about" }] }],
    },
    '/jobs': {
      title: 'Browse Jobs | VantaHire - Find Your Next Role',
      description: 'Browse open positions across technology, consulting, and more. Apply directly through VantaHire\'s recruiter-first platform.',
      canonical: 'https://vantahire.com/jobs',
      keywords: 'jobs India, tech jobs Bangalore, IT jobs APAC, apply online, VantaHire jobs',
    },
    '/recruiters': {
      title: 'Recruiters Directory | VantaHire',
      description: 'Meet VantaHire\'s specialist recruiters. Industry experts in IT, telecom, automotive, fintech, and healthcare hiring across India and APAC.',
      canonical: 'https://vantahire.com/recruiters',
      keywords: 'specialist recruiters India, IT recruiters, telecom recruiters, healthcare recruiters APAC',
    },
    '/brand': {
      title: 'Brand Assets | VantaHire',
      description: 'Download VantaHire logos, brand guidelines, and media assets. Everything you need for press, partnerships, and co-marketing.',
      canonical: 'https://vantahire.com/brand',
    },
    '/privacy-policy': {
      title: 'Privacy Policy | VantaHire',
      description: 'How VantaHire collects, uses, and protects your data. Read our privacy policy covering candidate data, recruiter data, and platform usage.',
      canonical: 'https://vantahire.com/privacy-policy',
    },
    '/terms-of-service': {
      title: 'Terms of Service | VantaHire',
      description: 'Terms and conditions for using the VantaHire recruiting platform. Covers account usage, data ownership, and service agreements.',
      canonical: 'https://vantahire.com/terms-of-service',
    },
    '/cookie-policy': {
      title: 'Cookie Policy | VantaHire',
      description: 'How VantaHire uses cookies and similar technologies. Learn about the cookies we use and how to manage your preferences.',
      canonical: 'https://vantahire.com/cookie-policy',
    },
  };

  app.get(Object.keys(MARKETING_PAGES), async (req, res, next) => {
    try {
      const pageMeta = MARKETING_PAGES[req.path];
      if (!pageMeta) return next();

      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");

      const baseUrl = (process.env.BASE_URL || 'https://vantahire.com').replace(/\/$/, '');

      html = upsertTitle(html, pageMeta.title);
      html = upsertMetaTag(html, 'name', 'title', pageMeta.title);
      html = upsertMetaTag(html, 'name', 'description', pageMeta.description);
      if (pageMeta.keywords) {
        html = upsertMetaTag(html, 'name', 'keywords', pageMeta.keywords);
      }
      html = upsertLinkRel(html, 'canonical', pageMeta.canonical);
      html = upsertMetaTag(html, 'property', 'og:title', pageMeta.title);
      html = upsertMetaTag(html, 'property', 'og:description', pageMeta.description);
      html = upsertMetaTag(html, 'property', 'og:url', pageMeta.canonical);
      html = upsertMetaTag(html, 'property', 'og:type', 'website');
      html = upsertMetaTag(html, 'property', 'og:image', `${baseUrl}/og-image.jpg`);
      html = upsertMetaTag(html, 'name', 'twitter:card', 'summary_large_image');
      html = upsertMetaTag(html, 'name', 'twitter:url', pageMeta.canonical);
      html = upsertMetaTag(html, 'name', 'twitter:title', pageMeta.title);
      html = upsertMetaTag(html, 'name', 'twitter:description', pageMeta.description);
      html = upsertMetaTag(html, 'name', 'twitter:image', `${baseUrl}/twitter-image.jpg`);

      // Inject page-specific JSON-LD schemas (BreadcrumbList, FAQPage, etc.)
      if (pageMeta.jsonLd) {
        for (const schema of pageMeta.jsonLd) {
          html = injectJsonLd(html, schema);
        }
      }

      // SSR body render — only for crawlers (avoids hydration cost for real users)
      const bot = isCrawler(req);
      if (ssrRender && bot) {
        try {
          const { html: ssrHtml } = ssrRender(req.path);
          if (ssrHtml) {
            html = injectSSR(html, ssrHtml);
          }
        } catch (ssrError) {
          console.error('[SSR] Marketing page render error:', ssrError);
        }
      }

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.setHeader('X-SSR-Status', ssrRender ? (bot ? 'active' : 'bot-only') : 'disabled');
      res.setHeader('Vary', 'User-Agent');
      res.send(html);
    } catch (error) {
      console.error('[SSR Meta] Error injecting marketing page meta:', error);
      next();
    }
  });

  // Serve static landing pages from client/public (e.g., /landing/hiring-insights.html)
  // These bypass the SPA and are served directly as static HTML
  if (fs.existsSync(clientPublicPath)) {
    app.use(express.static(clientPublicPath, {
      extensions: ['html'],
      index: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }));
  }

  // Cache policy: cache-bust hashed assets aggressively, but keep index.html no-cache
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (filePath.includes('/assets/')) {
        // hashed assets
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));

  // Server-side JSON-LD + SSR body injection for job detail pages
  // This ensures Googlebot sees structured data AND rendered content without executing JavaScript
  app.get('/jobs/:param', async (req, res, next) => {
    try {
      const { param } = req.params;
      const identifier = parseJobIdentifier(param);

      // Fetch job data
      let job;
      if (identifier.type === 'id') {
        job = await storage.getJobWithRecruiter(identifier.value as number);
      } else {
        job = await storage.getJobBySlug(identifier.value as string);
      }

      // Gap 3: Return proper HTTP status codes for crawlers
      if (!job) {
        res.status(404).setHeader('Content-Type', 'text/html');
        res.send('<!DOCTYPE html><html><head><meta name="robots" content="noindex"><title>Job Not Found</title></head><body><h1>404 — Job not found</h1></body></html>');
        return;
      }
      if (!job.isActive || job.status !== 'approved') {
        const reason = (job as any).deactivationReason === 'filled'
          ? 'This position has been filled.'
          : 'This job listing is no longer active.';
        res.status(410).setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html><head><meta name="robots" content="noindex"><title>Job No Longer Available</title></head><body><h1>410 — ${reason}</h1></body></html>`);
        return;
      }

      // Read the index.html template
      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");

      // Generate JSON-LD
      const baseUrl = process.env.BASE_URL || 'https://vantahire.com';
      const jobUrl = job.slug ? `${baseUrl}/jobs/${job.slug}` : `${baseUrl}/jobs/${job.id}`;
      const pageTitle = `${job.title} | VantaHire`;
      const metaDescription = truncateText(
        `Apply for ${job.title} at ${job.location}. ${stripHtml(job.description)}`,
        155
      );

      const jsonLd = generateJobPostingSchema({
        id: job.id,
        title: job.title,
        description: job.description,
        location: job.location,
        type: job.type,
        skills: job.skills as string[] | null,
        clientName: job.client?.name ?? null,
        clientDomain: job.client?.domain ?? null,
        createdAt: job.createdAt,
        deadline: job.deadline,
        expiresAt: job.expiresAt,
        slug: job.slug,
        salaryMin: (job as any).salaryMin ?? null,
        salaryMax: (job as any).salaryMax ?? null,
        salaryPeriod: (job as any).salaryPeriod ?? null,
        experienceYears: (job as any).experienceYears ?? null,
        educationRequirement: (job as any).educationRequirement ?? null,
      }, baseUrl);

      // Inject job-specific meta tags for crawlers that don't run JS
      html = upsertTitle(html, pageTitle);
      html = upsertMetaTag(html, 'name', 'title', pageTitle);
      html = upsertMetaTag(html, 'name', 'description', metaDescription);
      html = upsertLinkRel(html, 'canonical', jobUrl);
      html = upsertMetaTag(html, 'property', 'og:title', pageTitle);
      html = upsertMetaTag(html, 'property', 'og:description', metaDescription);
      html = upsertMetaTag(html, 'property', 'og:url', jobUrl);
      html = upsertMetaTag(html, 'property', 'og:type', 'website');
      html = upsertMetaTag(html, 'property', 'og:image', `${baseUrl}/og-image.jpg`);
      html = upsertMetaTag(html, 'name', 'twitter:card', 'summary_large_image');
      html = upsertMetaTag(html, 'name', 'twitter:title', pageTitle);
      html = upsertMetaTag(html, 'name', 'twitter:description', metaDescription);
      html = upsertMetaTag(html, 'name', 'twitter:image', `${baseUrl}/twitter-image.jpg`);

      // Only inject if JSON-LD generation succeeded
      if (jsonLd) {
        html = injectJsonLd(html, jsonLd, 'jobposting');
      }

      // SSR body render — only for crawlers (avoids hydration cost for real users)
      const bot = isCrawler(req);
      if (ssrRender && bot) {
        try {
          // Pre-populate query cache with the job data we already fetched
          const initialData: Record<string, unknown> = {
            [JSON.stringify(["/api/jobs", param])]: job,
          };
          const { html: ssrHtml } = ssrRender(`/jobs/${param}`, initialData);
          if (ssrHtml) {
            html = injectSSR(html, ssrHtml);
          }
        } catch (ssrError) {
          console.error('[SSR] Job detail render error:', ssrError);
        }
      }

      // Serve the modified HTML
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.setHeader('Vary', 'User-Agent');
      res.send(html);
    } catch (error) {
      console.error('[SSR JSON-LD] Error injecting job schema:', error);
      // Fall through to regular SPA serving on error
      next();
    }
  });

  // Known SPA routes that should return 200 (client-side routing handles them)
  const KNOWN_SPA_ROUTES = new Set([
    ...Object.keys(MARKETING_PAGES),
    '/auth', '/candidate-auth', '/recruiter-auth', '/verify-email', '/reset-password',
    '/register-hiring-manager', '/accept-co-recruiter', '/register-co-recruiter',
    '/recruiter-dashboard', '/admin', '/admin-dashboard', '/admin-super-dashboard',
    '/unified-admin-dashboard', '/applications', '/candidates', '/my-jobs',
    '/jobs/post', '/clients', '/profile/settings', '/my-dashboard',
    '/hiring-manager', '/application-management', '/analytics',
    '/org/settings', '/org/team', '/org/billing', '/org/domain', '/org/analytics', '/org/choice',
    '/blocked/seat-removed', '/admin/forms', '/admin/email-templates',
    '/privacy-policy', '/terms-of-service', '/cookie-policy',
    '/consultants',
  ]);

  function isKnownRoute(path: string): boolean {
    if (KNOWN_SPA_ROUTES.has(path)) return true;
    // Dynamic routes: /jobs/:id, /jobs/:id/*, /recruiters/:id, /form/*, /client-shortlist/*
    if (/^\/jobs\/[^/]+/.test(path)) return true;
    if (/^\/recruiters\/[^/]+/.test(path)) return true;
    if (/^\/form\//.test(path)) return true;
    if (/^\/client-shortlist\//.test(path)) return true;
    if (/^\/admin\//.test(path)) return true;
    return false;
  }

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    // Use originalUrl (not req.path which may be '/' in app.use('*') context)
    const routePath = (req.originalUrl.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
    const statusCode = isKnownRoute(routePath) ? 200 : 404;
    // Read file and send with explicit status (sendFile overrides status to 200)
    const html = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
    res.status(statusCode).setHeader('Content-Type', 'text/html').send(html);
  });
}
