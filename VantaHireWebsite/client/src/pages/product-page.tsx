import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Database, Search, Kanban, MessageSquare, Users, Shield, ArrowRight, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const sections = [
  {
    icon: <Search className="w-8 h-8" />,
    title: "AI finds your candidates. You choose who to call.",
    description: "When you click \"Find Candidates,\" VantaHire's sourcing engine goes to work.",
    details: [
      "Job digest — the platform reads your JD and extracts key requirements",
      "Pool scan — your existing talent pool is searched first",
      "Web discovery — AI searches the web for net-new candidates who match",
      "Fit scoring — every candidate receives a score (0-100) broken down by skill match, seniority, location, and freshness",
      "Tiering — results split into Best Matches and Broader Pool",
      "Delivery — a ranked shortlist appears in minutes"
    ],
    cta: "Try AI Sourcing",
    anchor: "ai-sourcing"
  },
  {
    icon: <Database className="w-8 h-8" />,
    title: "Your talent library compounds with every hire.",
    description: "Every resume that enters VantaHire is automatically processed into a semantic knowledge graph.",
    details: [
      "Text extraction with AI-powered field parsing",
      "Sentence-aware chunking into meaningful segments",
      "Vector embedding into a semantic knowledge graph",
      "Natural language search — \"Senior backend engineers with Kubernetes experience in Bangalore\" returns ranked results",
      "Past candidates become searchable and reusable for new roles",
      "No manual tagging or categorization required"
    ],
    anchor: "knowledge-graph"
  },
  {
    icon: <Kanban className="w-8 h-8" />,
    title: "Track every candidate. Move fast.",
    description: "The pipeline is a drag-and-drop Kanban board built for speed.",
    details: [
      "Custom stages per job — define your own hiring workflow",
      "Bulk actions — move, email, or archive 20 candidates in one click",
      "Stage automation — move to \"Interview\" and confirmation fires automatically",
      "AI-screened applications — inbound candidates scored on arrival",
      "Stale candidate alerts — candidates sitting too long get flagged"
    ],
    anchor: "pipeline"
  },
  {
    icon: <MessageSquare className="w-8 h-8" />,
    title: "WhatsApp and email. Built in. Not bolted on.",
    description: "Native outreach inside the ATS. No third-party integrations. No switching tabs.",
    details: [
      "Email with variable substitution — candidate name, job title, interview details",
      "WhatsApp via Cloud API with pre-approved templates and full audit log",
      "Stage-based triggers — move a candidate and the message fires automatically",
      "In India and APAC, WhatsApp read rates exceed 90% (industry benchmark)",
      "Every message logged for compliance"
    ],
    anchor: "outreach"
  },
  {
    icon: <Users className="w-8 h-8" />,
    title: "Client feedback in hours, not days.",
    description: "For staffing agencies, the bottleneck is getting client feedback. VantaHire's Client Portal fixes that.",
    details: [
      "Share a curated shortlist via a single link",
      "No login required for the client",
      "Structured feedback per candidate: advance, hold, or reject",
      "Feedback appears in the recruiter's dashboard immediately",
      "All feedback across all clients and jobs in one place"
    ],
    anchor: "client-portal"
  },
  {
    icon: <Shield className="w-8 h-8" />,
    title: "Your data stays yours.",
    description: "VantaHire enforces a three-tier privacy model.",
    details: [
      "Private — resumes uploaded by your team, visible only to your organization",
      "Platform — candidates who opted in to be discoverable across the platform",
      "Public — web discoveries from LinkedIn, GitHub, and public profiles",
      "Application history always stays private",
      "Consent enforced at every layer"
    ],
    anchor: "privacy"
  }
];

export default function ProductPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <Layout>
      <Helmet>
        <title>How VantaHire Works | AI Sourcing, Pipeline, Outreach in One Platform</title>
        <meta name="description" content="Three layers. One platform. AI sourcing engine, recruiter workflow, and candidate memory system — from candidate discovery to client feedback without switching tools." />
        <link rel="canonical" href="https://www.vantahire.com/product" />
        <meta property="og:title" content="How VantaHire Works | AI-Native Recruiting Platform" />
        <meta property="og:description" content="Three layers. One platform. AI sourcing engine, recruiter workflow, and candidate memory system." />
        <meta property="og:url" content="https://www.vantahire.com/product" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="How VantaHire Works | AI-Native Recruiting Platform" />
        <meta name="twitter:description" content="Three layers. One platform. From candidate discovery to client feedback without switching tools." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "Product", "item": "https://www.vantahire.com/product" }
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
              <span className="text-white">How VantaHire</span>
              <br />
              <span className="gradient-text-purple">works.</span>
            </h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto mb-2">
              Three layers. One platform.
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Every recruiter action — from candidate discovery to client feedback — in a single operating system.
            </p>
          </div>

          {/* Three-Layer Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-24">
            {[
              {
                title: "Intelligence Layer",
                items: ["Resume Knowledge Graph", "AI Sourcing Engine", "Fit Scoring + Identity Resolution", "Talent Search (semantic)"],
                color: "from-primary/20 to-primary/5",
                borderColor: "border-primary/30"
              },
              {
                title: "Outreach Layer",
                items: ["Email Outreach", "WhatsApp (Cloud API)", "Stage-Based Automation", "Template Library"],
                color: "from-green-500/20 to-green-500/5",
                borderColor: "border-green-500/30"
              },
              {
                title: "Operations Layer",
                items: ["Recruiter Dashboard", "Kanban Pipeline", "Client Portal", "Analytics + Reporting"],
                color: "from-blue-500/20 to-blue-500/5",
                borderColor: "border-blue-500/30"
              }
            ].map((layer, i) => (
              <div key={i} className={`bg-gradient-to-br ${layer.color} p-6 rounded-xl border ${layer.borderColor}`}>
                <h3 className="text-lg font-bold text-white mb-4">{layer.title}</h3>
                <ul className="space-y-2">
                  {layer.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-white/70 text-sm">
                      <Check className="w-4 h-4 text-white/40 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Product Sections */}
          <div className="space-y-20 mb-24">
            {sections.map((section, index) => (
              <div key={index} id={section.anchor} className="max-w-4xl mx-auto">
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                    {section.icon}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                      {section.title}
                    </h2>
                    <p className="text-lg text-white/70 mb-6">
                      {section.description}
                    </p>
                    <ul className="space-y-3 mb-6">
                      {section.details.map((detail, i) => (
                        <li key={i} className="flex items-start gap-3 text-white/60">
                          <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    {section.cta && (
                      <Button
                        variant="outlinePurple"
                        size="sm"
                        onClick={() => {
                          trackEvent("cta_click", { location: "product", action: section.anchor });
                          window.location.href = '/recruiter-auth';
                        }}
                        className="rounded-full"
                      >
                        {section.cta}
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              See it in action.
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              VantaHire replaces the tools you are stitching together today. Start free and run your first sourcing job in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="gold"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "product", action: "start_free" });
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
                  trackEvent("cta_click", { location: "product", action: "book_demo" });
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
