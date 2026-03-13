import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const atsComparison = [
  { feature: "Built with recruiter input", vantahire: true, others: false },
  { feature: "Day-1 productivity", vantahire: true, others: false },
  { feature: "AI-powered screening", vantahire: true, others: "Limited" },
  { feature: "No per-seat pricing", vantahire: true, others: false },
  { feature: "One-glance pipeline visibility", vantahire: true, others: false },
  { feature: "Setup time", vantahire: "Minutes", others: "Days to weeks" },
  { feature: "Onboarding", vantahire: "Self-serve", others: "Weeks of training" }
];

const differentiators = [
  {
    title: "Recruiter-First, Not Afterthought",
    description: "Every workflow designed with recruiter feedback from day one. If it adds clicks, it doesn't ship."
  },
  {
    title: "Velocity Over Bureaucracy",
    description: "Built for teams that move fast—not approval chains and enterprise bloat."
  },
  {
    title: "Clarity Over Complexity",
    description: "Answers at a glance, not buried in reports. Pipeline status, bottlenecks, counts—one screen."
  },
  {
    title: "Human Decisions, AI Acceleration",
    description: "Smart algorithms surface candidates; you make the calls. AI works for you, not instead of you."
  }
];

export default function ComparePage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <Layout>
      <Helmet>
        <title>Compare | VantaHire vs Complex ATS Platforms</title>
        <meta name="description" content="See how VantaHire compares to traditional ATS platforms. Built with recruiters, designed for velocity, zero complexity." />
        <link rel="canonical" href="https://www.vantahire.com/compare" />
        <meta property="og:title" content="Compare | VantaHire vs Complex ATS Platforms" />
        <meta property="og:description" content="They add features. We remove friction. See how VantaHire makes recruiting teams 2X more efficient." />
        <meta property="og:url" content="https://www.vantahire.com/compare" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Compare | VantaHire vs Complex ATS Platforms" />
        <meta name="twitter:description" content="They add features. We remove friction. See how VantaHire makes recruiting teams 2X more efficient." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "Compare", "item": "https://www.vantahire.com/compare" }
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
              <span className="text-white">Complex ATS vs.</span>
              <br />
              <span className="gradient-text-purple">VantaHire</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              They add features. We remove friction. That's how teams move faster.
            </p>
          </div>

          {/* VantaHire vs Other ATS */}
          <div className="mb-20">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">
              VantaHire vs Traditional Recruiting Systems
            </h2>
            <div className="max-w-4xl mx-auto overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 text-muted-foreground font-medium">Feature</th>
                    <th className="text-center py-4 px-4 text-primary font-semibold">VantaHire</th>
                    <th className="text-center py-4 px-4 text-muted-foreground font-medium">Others</th>
                  </tr>
                </thead>
                <tbody>
                  {atsComparison.map((row, index) => (
                    <tr key={index} className="border-b border-white/5">
                      <td className="py-4 px-4 text-white/70">{row.feature}</td>
                      <td className="py-4 px-4 text-center">
                        {row.vantahire === true ? (
                          <Check className="w-5 h-5 text-primary mx-auto" />
                        ) : (
                          <span className="text-white font-medium">{row.vantahire}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {row.others === true ? (
                          <Check className="w-5 h-5 text-muted-foreground mx-auto" />
                        ) : row.others === false ? (
                          <X className="w-5 h-5 text-muted-foreground/50 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">{row.others}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key Differentiators */}
          <div className="mb-20">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
              What Makes Us Different
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {differentiators.map((item, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/5"
                >
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-white/70">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Ready to Make the Switch?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Migrate in minutes, not months.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="gold"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "compare", action: "start_free" });
                  window.location.href = '/recruiter-auth';
                }}
                className="rounded-full px-8 py-6 text-lg font-semibold"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "compare", action: "get_walkthrough" });
                  window.open('https://cal.com/vantahire/quick-connect', '_blank');
                }}
                className="rounded-full px-8 py-6 text-lg"
              >
                Talk to Sales
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
