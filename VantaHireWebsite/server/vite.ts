import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  const MARKETING_PAGES_DEV: Record<string, { title: string; description: string; canonical: string }> = {
    '/': {
      title: 'VantaHire - Recruiting Velocity, by Design | Recruiter-First ATS',
      description: 'The recruiter-first ATS designed to remove friction and double your team\'s efficiency. Human decisions, AI acceleration. Built for consulting firms, agencies, and startups.',
      canonical: 'https://www.vantahire.com/',
    },
    '/product': {
      title: 'Product | VantaHire - The Recruiter-First ATS',
      description: 'Explore VantaHire\'s recruiter-first ATS platform. AI-powered candidate matching, Kanban pipeline management, team collaboration, and analytics—all designed for speed.',
      canonical: 'https://www.vantahire.com/product',
    },
    '/features': {
      title: 'Features | VantaHire - Everything You Need to Hire Faster',
      description: 'AI candidate matching, Kanban pipelines, email templates, interview scheduling, analytics dashboard, and team collaboration. All the features recruiters need.',
      canonical: 'https://www.vantahire.com/features',
    },
    '/pricing': {
      title: 'Pricing | VantaHire - Simple, Transparent Pricing',
      description: 'Start free, scale as you grow. VantaHire offers transparent pricing for recruiting teams of all sizes. No hidden fees, no long-term contracts.',
      canonical: 'https://www.vantahire.com/pricing',
    },
    '/compare': {
      title: 'Compare | VantaHire vs Complex ATS Platforms',
      description: 'See how VantaHire compares to legacy ATS platforms. Faster setup, recruiter-first design, and AI acceleration without the complexity.',
      canonical: 'https://www.vantahire.com/compare',
    },
    '/use-cases': {
      title: 'Use Cases | VantaHire - Built for Teams Like Yours',
      description: 'Discover how consulting firms, staffing agencies, startups, and enterprise teams use VantaHire to hire faster across India and APAC.',
      canonical: 'https://www.vantahire.com/use-cases',
    },
    '/about': {
      title: 'About Us | VantaHire - AI + Human Expertise for Better Hiring',
      description: 'VantaHire combines AI acceleration with human expertise to make recruiting faster and fairer. Learn about our mission, team, and vision.',
      canonical: 'https://www.vantahire.com/about',
    },
    '/jobs': {
      title: 'Browse Jobs | VantaHire - Find Your Next Role',
      description: 'Browse open positions across technology, consulting, and more. Apply directly through VantaHire\'s recruiter-first platform.',
      canonical: 'https://www.vantahire.com/jobs',
    },
    '/recruiters': {
      title: 'Recruiters Directory | VantaHire',
      description: 'Meet VantaHire\'s specialist recruiters. Industry experts in IT, telecom, automotive, fintech, and healthcare hiring across India and APAC.',
      canonical: 'https://www.vantahire.com/recruiters',
    },
    '/brand': {
      title: 'Brand Assets | VantaHire',
      description: 'Download VantaHire logos, brand guidelines, and media assets. Everything you need for press, partnerships, and co-marketing.',
      canonical: 'https://www.vantahire.com/brand',
    },
  };

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
        const baseUrl = (process.env.BASE_URL || 'https://www.vantahire.com').replace(/\/$/, '');
        template = upsertTitle(template, pageMeta.title);
        template = upsertMetaTag(template, 'name', 'title', pageMeta.title);
        template = upsertMetaTag(template, 'name', 'description', pageMeta.description);
        template = upsertLinkRel(template, 'canonical', pageMeta.canonical);
        template = upsertMetaTag(template, 'property', 'og:title', pageMeta.title);
        template = upsertMetaTag(template, 'property', 'og:description', pageMeta.description);
        template = upsertMetaTag(template, 'property', 'og:url', pageMeta.canonical);
        template = upsertMetaTag(template, 'property', 'og:type', 'website');
        template = upsertMetaTag(template, 'property', 'og:image', `${baseUrl}/og-image.jpg`);
        template = upsertMetaTag(template, 'name', 'twitter:card', 'summary_large_image');
        template = upsertMetaTag(template, 'name', 'twitter:title', pageMeta.title);
        template = upsertMetaTag(template, 'name', 'twitter:description', pageMeta.description);
        template = upsertMetaTag(template, 'name', 'twitter:image', `${baseUrl}/twitter-image.jpg`);
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

export function serveStatic(app: Express) {
  // Compute dirname in ESM
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "public");
  const clientPublicPath = path.resolve(__dirname, "..", "client", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // SSR meta injection for marketing pages (registered before static middleware
  // to prevent express.static from intercepting routes that match directories
  // like /brand which has a physical client/public/brand/ directory)
  const MARKETING_PAGES: Record<string, { title: string; description: string; canonical: string }> = {
    '/': {
      title: 'VantaHire - Recruiting Velocity, by Design | Recruiter-First ATS',
      description: 'The recruiter-first ATS designed to remove friction and double your team\'s efficiency. Human decisions, AI acceleration. Built for consulting firms, agencies, and startups.',
      canonical: 'https://www.vantahire.com/',
    },
    '/product': {
      title: 'Product | VantaHire - The Recruiter-First ATS',
      description: 'Explore VantaHire\'s recruiter-first ATS platform. AI-powered candidate matching, Kanban pipeline management, team collaboration, and analytics—all designed for speed.',
      canonical: 'https://www.vantahire.com/product',
    },
    '/features': {
      title: 'Features | VantaHire - Everything You Need to Hire Faster',
      description: 'AI candidate matching, Kanban pipelines, email templates, interview scheduling, analytics dashboard, and team collaboration. All the features recruiters need.',
      canonical: 'https://www.vantahire.com/features',
    },
    '/pricing': {
      title: 'Pricing | VantaHire - Simple, Transparent Pricing',
      description: 'Start free, scale as you grow. VantaHire offers transparent pricing for recruiting teams of all sizes. No hidden fees, no long-term contracts.',
      canonical: 'https://www.vantahire.com/pricing',
    },
    '/compare': {
      title: 'Compare | VantaHire vs Complex ATS Platforms',
      description: 'See how VantaHire compares to legacy ATS platforms. Faster setup, recruiter-first design, and AI acceleration without the complexity.',
      canonical: 'https://www.vantahire.com/compare',
    },
    '/use-cases': {
      title: 'Use Cases | VantaHire - Built for Teams Like Yours',
      description: 'Discover how consulting firms, staffing agencies, startups, and enterprise teams use VantaHire to hire faster across India and APAC.',
      canonical: 'https://www.vantahire.com/use-cases',
    },
    '/about': {
      title: 'About Us | VantaHire - AI + Human Expertise for Better Hiring',
      description: 'VantaHire combines AI acceleration with human expertise to make recruiting faster and fairer. Learn about our mission, team, and vision.',
      canonical: 'https://www.vantahire.com/about',
    },
    '/jobs': {
      title: 'Browse Jobs | VantaHire - Find Your Next Role',
      description: 'Browse open positions across technology, consulting, and more. Apply directly through VantaHire\'s recruiter-first platform.',
      canonical: 'https://www.vantahire.com/jobs',
    },
    '/recruiters': {
      title: 'Recruiters Directory | VantaHire',
      description: 'Meet VantaHire\'s specialist recruiters. Industry experts in IT, telecom, automotive, fintech, and healthcare hiring across India and APAC.',
      canonical: 'https://www.vantahire.com/recruiters',
    },
    '/brand': {
      title: 'Brand Assets | VantaHire',
      description: 'Download VantaHire logos, brand guidelines, and media assets. Everything you need for press, partnerships, and co-marketing.',
      canonical: 'https://www.vantahire.com/brand',
    },
  };

  app.get(Object.keys(MARKETING_PAGES), async (req, res, next) => {
    try {
      const pageMeta = MARKETING_PAGES[req.path];
      if (!pageMeta) return next();

      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");

      const baseUrl = (process.env.BASE_URL || 'https://www.vantahire.com').replace(/\/$/, '');

      html = upsertTitle(html, pageMeta.title);
      html = upsertMetaTag(html, 'name', 'title', pageMeta.title);
      html = upsertMetaTag(html, 'name', 'description', pageMeta.description);
      html = upsertLinkRel(html, 'canonical', pageMeta.canonical);
      html = upsertMetaTag(html, 'property', 'og:title', pageMeta.title);
      html = upsertMetaTag(html, 'property', 'og:description', pageMeta.description);
      html = upsertMetaTag(html, 'property', 'og:url', pageMeta.canonical);
      html = upsertMetaTag(html, 'property', 'og:type', 'website');
      html = upsertMetaTag(html, 'property', 'og:image', `${baseUrl}/og-image.jpg`);
      html = upsertMetaTag(html, 'name', 'twitter:card', 'summary_large_image');
      html = upsertMetaTag(html, 'name', 'twitter:title', pageMeta.title);
      html = upsertMetaTag(html, 'name', 'twitter:description', pageMeta.description);
      html = upsertMetaTag(html, 'name', 'twitter:image', `${baseUrl}/twitter-image.jpg`);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
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
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      } else if (filePath.includes('/assets/')) {
        // hashed assets
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));

  // Server-side JSON-LD injection for job detail pages
  // This ensures Googlebot sees structured data without executing JavaScript
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
      const baseUrl = process.env.BASE_URL || 'https://www.vantahire.com';
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

      // Serve the modified HTML
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.send(html);
    } catch (error) {
      console.error('[SSR JSON-LD] Error injecting job schema:', error);
      // Fall through to regular SPA serving on error
      next();
    }
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    // Ensure the SPA shell (index.html) is never cached, to avoid hash mismatches
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
