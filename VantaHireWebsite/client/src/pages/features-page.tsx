import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import {
  Database,
  Search,
  MessageSquare,
  Users,
  LayoutDashboard,
  Target,
  ArrowRight,
  Check
} from "lucide-react";

const pillars = [
  {
    id: "pillar-1",
    icon: <Database className="w-8 h-8" />,
    layer: "Intelligence",
    title: "Resume Knowledge Graph",
    label: "Every resume builds your hiring intelligence",
    outcome: "Recruiters never start from scratch. The talent library grows with every resume added to the system.",
    features: [
      "Resumes chunked into sentence-aware segments, embedded, and indexed into a vector-based knowledge graph",
      "Talent Search is live — recruiters search their talent pool using natural language with hybrid ranking",
      "Bulk resume import with AI-powered field extraction (name, email, phone, skills, experience)",
      "Past candidates become searchable and reusable for new roles, even across different job titles",
      "No manual tagging or categorization required"
    ],
    iconBg: "bg-primary/20",
    iconColor: "text-primary"
  },
  {
    id: "pillar-2",
    icon: <Search className="w-8 h-8" />,
    layer: "Intelligence",
    title: "AI Candidate Discovery",
    label: "AI-sourced candidates, ranked for recruiter action",
    outcome: "Recruiters get a ranked call sheet, not a raw database dump. They know who to contact first and why.",
    features: [
      "AI sourcing returns ranked candidates with fit scores — skill match, seniority, location, freshness",
      "Results tiered: Best Matches (high confidence) and Broader Pool (expanded criteria)",
      "Identity confidence badges on every lead",
      "Pool scan + web discovery sourcing flow — your talent pool is searched first, then the web",
      "No Boolean skills needed — describe the role and let the AI work"
    ],
    iconBg: "bg-warning/20",
    iconColor: "text-warning"
  },
  {
    id: "pillar-3",
    icon: <MessageSquare className="w-8 h-8" />,
    layer: "Outreach",
    title: "WhatsApp + Email Engagement",
    label: "Reach candidates instantly via email and WhatsApp",
    outcome: "Candidates respond on the channel they actually check. No-shows drop. Recruiters stop using personal phones.",
    features: [
      "Email and WhatsApp outreach native to the platform — no third-party integrations",
      "WhatsApp runs through Cloud API with pre-approved templates and full audit log",
      "Stage-based automation triggers — move to a stage and the message fires automatically",
      "90%+ WhatsApp read rates vs 15-20% email open rates in India and APAC (industry benchmark)",
      "Every message logged for compliance"
    ],
    iconBg: "bg-green-500/20",
    iconColor: "text-green-400"
  },
  {
    id: "pillar-4",
    icon: <Users className="w-8 h-8" />,
    layer: "Operations",
    title: "Client Feedback Portal",
    label: "Share shortlists with clients. Get feedback without the back-and-forth.",
    outcome: "Agencies close placements faster. Zero email ping-pong. All feedback visible in one dashboard across all clients and jobs.",
    features: [
      "Client portal generates a shareable link — no login required for clients",
      "Structured feedback per candidate: approve, hold, or reject",
      "Feedback appears in the recruiter dashboard in real time",
      "Multi-client view — see all feedback across all clients and jobs in one place",
      "No email chains. No chasing. Act on structured feedback."
    ],
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400"
  },
  {
    id: "pillar-5",
    icon: <LayoutDashboard className="w-8 h-8" />,
    layer: "Operations",
    title: "Recruiter Productivity Dashboard",
    label: "One recruiter. Many open roles. Zero chaos.",
    outcome: "A single recruiter manages more roles without dropping candidates. Leadership gets real-time visibility without asking for updates.",
    features: [
      "Action-item dashboard with daily priorities across all jobs",
      "Bulk pipeline actions — move, email, archive",
      "Job health scoring (Green/Amber/Red) with stale candidate alerts",
      "Analytics: pipeline velocity, conversion rates, time-in-stage, source performance",
      "Day-1 productive — no training needed"
    ],
    iconBg: "bg-purple-500/20",
    iconColor: "text-purple-400"
  },
  {
    id: "pillar-6",
    icon: <Target className="w-8 h-8" />,
    layer: "Operations",
    title: "Job Command Center",
    label: "Post, source, and screen — one command center per job",
    outcome: "Everything that matters for a role lives in one place. No switching between sourcing tools, email clients, spreadsheets, and calendar apps.",
    features: [
      "Single job view with full sub-navigation across all functions",
      "AI-assisted JD writing with bias detection and SEO scoring",
      "Application screening with AI fit scores",
      "From \"I have a JD\" to \"I'm messaging the top 5 leads\" without ever leaving VantaHire",
      "Replaces 4-6 separate tools"
    ],
    iconBg: "bg-gradient-to-br from-purple-500/15 to-amber-500/15",
    iconColor: "text-primary"
  }
];

export default function FeaturesPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <Layout>
      <Helmet>
        <title>Features | VantaHire - Six Pillars of AI-Native Recruiting</title>
        <meta name="description" content="Resume Knowledge Graph, AI Candidate Discovery, WhatsApp + Email Outreach, Client Feedback Portal, Recruiter Dashboard, and Job Command Center. All the capabilities recruiters need." />
        <link rel="canonical" href="https://www.vantahire.com/features" />
        <meta property="og:title" content="Features | VantaHire - Six Pillars of AI-Native Recruiting" />
        <meta property="og:description" content="Resume Knowledge Graph, AI Discovery, WhatsApp Outreach, Client Portal, Dashboard, and Command Center — every capability recruiters need." />
        <meta property="og:url" content="https://www.vantahire.com/features" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Features | VantaHire - Six Pillars of AI-Native Recruiting" />
        <meta name="twitter:description" content="Resume Knowledge Graph, AI Discovery, WhatsApp Outreach, Client Portal, Dashboard, and Command Center." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://www.vantahire.com/features" }
            ]
          })}
        </script>
      </Helmet>

      <div className="public-theme min-h-screen bg-background text-foreground">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>

        <div className={`container mx-auto px-4 py-16 relative z-10 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          {/* Hero Section */}
          <div className="text-center mb-20 pt-8">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mx-auto mb-6"></div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="text-white">Six Pillars of</span>
              <br />
              <span className="gradient-text-purple">AI-Native Recruiting</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Three layers. Six capabilities. Every recruiter action covered.
            </p>
          </div>

          {/* Pillars */}
          <div className="space-y-16 mb-20">
            {pillars.map((pillar, index) => (
              <div key={index} id={pillar.id} className="max-w-4xl mx-auto scroll-mt-24">
                {/* Layer badge */}
                <div className="mb-4">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                    {pillar.layer} Layer
                  </span>
                </div>

                <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-8 md:p-10 rounded-2xl border border-white/5 hover:border-primary/20 transition-all duration-300">
                  <div className="flex items-start gap-6">
                    <div className={`w-16 h-16 rounded-xl ${pillar.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <span className={pillar.iconColor}>{pillar.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                        {pillar.title}
                      </h2>
                      <p className="text-primary text-sm font-medium mb-4">
                        {pillar.label}
                      </p>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="mt-6 space-y-3">
                    {pillar.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-white/70">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Outcome */}
                  <div className="mt-6 pt-6 border-t border-white/5">
                    <p className="text-white/50 text-sm">
                      <span className="text-white/70 font-medium">Outcome:</span>{" "}
                      {pillar.outcome}
                    </p>
                  </div>

                  {/* Link to product for context */}
                  <div className="mt-4">
                    <a
                      href="/product"
                      className="text-primary/60 text-sm hover:text-primary transition-colors inline-flex items-center gap-1"
                      onClick={(e) => { e.preventDefault(); window.location.href = '/product'; }}
                    >
                      See platform context <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Try AI Sourcing
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Start free and explore every capability VantaHire offers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="gold"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "features", action: "start_free" });
                  window.location.href = '/recruiter-auth';
                }}
                className="rounded-full px-8 py-6 text-lg font-semibold"
              >
                Start Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "features", action: "book_demo" });
                  window.open('https://cal.com/vantahire/quick-connect', '_blank');
                }}
                className="rounded-full px-8 py-6 text-lg"
              >
                Book Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
