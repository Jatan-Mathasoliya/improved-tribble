import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Brain, ListChecks, Kanban, Users, ArrowRight, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const features = [
  {
    icon: <Brain className="w-8 h-8" />,
    title: "Flexible Screening",
    description: "Manual review when you need control. AI screening when volume demands speed. Your call."
  },
  {
    icon: <ListChecks className="w-8 h-8" />,
    title: "Recruiter Dashboard",
    description: "Clear daily priorities. Open VantaHire and know exactly what needs attention—today."
  },
  {
    icon: <Kanban className="w-8 h-8" />,
    title: "Job Command Center",
    description: "Candidates, outreach, scheduling—all centered on the job. No more 12-tab chaos."
  },
  {
    icon: <Users className="w-8 h-8" />,
    title: "Leadership Insights",
    description: "Real-time pipeline health and bottleneck detection—without running reports or chasing updates."
  }
];

const steps = [
  {
    number: "01",
    title: "Post Your Job",
    description: "Create a job posting in minutes. Our AI helps you write compelling descriptions that attract the right candidates."
  },
  {
    number: "02",
    title: "Get Matched Candidates",
    description: "Our AI scans and scores applications instantly. You get a ranked shortlist of the best fits—no manual screening required."
  },
  {
    number: "03",
    title: "Hire with Confidence",
    description: "Move candidates through your pipeline, schedule interviews, and make offers—all from one platform."
  }
];

export default function ProductPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <Layout>
      <Helmet>
        <title>Product | VantaHire - The Recruiter-First ATS</title>
        <meta name="description" content="The ATS designed to remove friction and double your team's efficiency. Human decisions, AI acceleration." />
        <link rel="canonical" href="https://www.vantahire.com/product" />
        <meta property="og:title" content="The Recruiter-First ATS That Actually Works" />
        <meta property="og:description" content="The recruiter-first ATS that removes friction. Built with recruiters, designed for velocity." />
        <meta property="og:url" content="https://www.vantahire.com/product" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Product | VantaHire - Recruiter-First ATS" />
        <meta name="twitter:description" content="The ATS designed to remove friction and double your team's efficiency." />
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
              <span className="text-white">The Recruiter-First ATS That</span>
              <br />
              <span className="gradient-text-purple">Actually Works</span>
            </h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto mb-2">
              Human decisions, AI acceleration.
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Track candidates, automate workflows, and hire faster—without the complexity.
            </p>
            <Button
              variant="gold"
              size="lg"
              onClick={() => {
                trackEvent("cta_click", { location: "product", action: "start_free" });
                window.location.href = '/recruiter-auth';
              }}
              className="rounded-full px-8 py-6 text-lg font-semibold"
            >
              See the Difference
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>

          {/* Platform Features */}
          <div className="mb-24">
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
              What Efficiency Looks Like
            </h2>
            <p className="text-lg text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Most recruiting systems add features. We remove friction.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-8 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300"
                >
                  <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                  <p className="text-white/70 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className="mb-24">
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Three simple steps to better hiring.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {steps.map((step, index) => (
                <div key={index} className="relative">
                  <div className="text-6xl font-bold text-primary/20 mb-4">{step.number}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-white/70">{step.description}</p>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-12 right-0 transform translate-x-1/2">
                      <ArrowRight className="w-6 h-6 text-primary/40" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Benefits */}
          <div className="max-w-4xl mx-auto mb-24">
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-8 md:p-12 rounded-2xl border border-white/5">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Built Different. Built With You.</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  "Designed for 2X recruiter efficiency",
                  "70% fewer clicks to action",
                  "Day-1 productivity—no training required",
                  "One-glance pipeline visibility",
                  "No per-seat pricing—invite your whole team",
                  "Built with recruiter feedback from day one"
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-white/80">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Ready to Recruit Faster?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Remove the friction. Start free. No credit card required.
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
                Start Recruiting Faster
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "product", action: "get_walkthrough" });
                  window.open('https://cal.com/vantahire/quick-connect', '_blank');
                }}
                className="rounded-full px-8 py-6 text-lg"
              >
                Get a Walkthrough
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
