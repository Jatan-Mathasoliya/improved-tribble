import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { Rocket, Building2, Users, Briefcase, Code, Wifi, CreditCard, HeartPulse, Car } from "lucide-react";

const useCases = [
  {
    icon: <Rocket className="w-8 h-8" />,
    title: "Startups",
    subtitle: "Hire your first 10 engineers without breaking the bank",
    description: "You're moving fast and can't afford to waste time on bad hires. VantaHire's AI helps you find quality candidates quickly, while our free tier lets you get started without upfront costs.",
    features: [
      "Free tier to get started",
      "AI-powered screening for quality over quantity",
      "Move fast without sacrificing hire quality"
    ]
  },
  {
    icon: <Building2 className="w-8 h-8" />,
    title: "Agencies",
    subtitle: "Manage multiple clients from one dashboard",
    description: "Juggling multiple clients? VantaHire keeps everything organized with separate pipelines, client-specific templates, and unified reporting.",
    features: [
      "Multi-client workspace",
      "White-label options available",
      "Bulk actions for efficiency"
    ]
  },
  {
    icon: <Users className="w-8 h-8" />,
    title: "Enterprises",
    subtitle: "Scale hiring across departments with consistency",
    description: "Standardize your hiring process across teams. Role-based access, custom workflows, and analytics that leadership actually uses.",
    features: [
      "Custom approval workflows",
      "Department-level reporting",
      "SSO and enterprise security"
    ]
  },
  {
    icon: <Briefcase className="w-8 h-8" />,
    title: "HR Teams",
    subtitle: "Replace spreadsheets with smart automation",
    description: "Stop tracking candidates in Excel. VantaHire gives you a proper system with automation, templates, and analytics—without the enterprise price tag.",
    features: [
      "Easy migration from spreadsheets",
      "Automated status updates",
      "Simple, intuitive interface"
    ]
  }
];

const industries = [
  {
    icon: <Code className="w-6 h-6" />,
    name: "IT & Technology",
    description: "Find developers, engineers, and tech leads who actually match your stack."
  },
  {
    icon: <Wifi className="w-6 h-6" />,
    name: "Telecom",
    description: "Hire network engineers, RF specialists, and telecom professionals."
  },
  {
    icon: <CreditCard className="w-6 h-6" />,
    name: "Fintech",
    description: "Source compliance-savvy talent for your financial technology needs."
  },
  {
    icon: <HeartPulse className="w-6 h-6" />,
    name: "Healthcare",
    description: "Recruit healthcare IT professionals and medical technology specialists."
  },
  {
    icon: <Car className="w-6 h-6" />,
    name: "Automotive",
    description: "Find embedded systems engineers and automotive software talent."
  }
];

export default function UseCasesPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Use Cases | VantaHire - Built for Teams Like Yours</title>
        <meta name="description" content="See how startups, agencies, enterprises, and HR teams use VantaHire to hire faster. Industry solutions for IT, Telecom, Fintech, Healthcare, and Automotive." />
        <link rel="canonical" href="https://www.vantahire.com/use-cases" />
        <meta property="og:title" content="Use Cases | VantaHire - Built for Teams Like Yours" />
        <meta property="og:description" content="From startups to enterprises, see how teams use VantaHire to transform their hiring." />
        <meta property="og:url" content="https://www.vantahire.com/use-cases" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Use Cases | VantaHire - Built for Teams Like Yours" />
        <meta name="twitter:description" content="From startups to enterprises, see how teams use VantaHire to transform their hiring." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "Use Cases", "item": "https://www.vantahire.com/use-cases" }
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
              <span className="text-white">Built for Teams</span>
              <br />
              <span className="gradient-text-purple">Like Yours</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From startups to enterprises, see how teams use VantaHire.
            </p>
          </div>

          {/* Use Case Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-24">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-8 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  {useCase.icon}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{useCase.title}</h3>
                <p className="text-primary font-medium mb-4">{useCase.subtitle}</p>
                <p className="text-white/70 mb-6 leading-relaxed">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-white/60 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Industries Section */}
          <div className="mb-24">
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
              Industry Expertise
            </h2>
            <p className="text-lg text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Deep experience in the industries where great hiring matters most.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
              {industries.map((industry, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/5 text-center hover:border-primary/30 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto mb-4 text-primary">
                    {industry.icon}
                  </div>
                  <h3 className="text-white font-semibold mb-2">{industry.name}</h3>
                  <p className="text-white/60 text-sm">{industry.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join teams across industries who hire smarter with VantaHire.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="gold"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "use_cases", action: "start_free" });
                  window.location.href = '/recruiter-auth';
                }}
                className="rounded-full px-8 py-6 text-lg font-semibold"
              >
                Get Started Free
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => {
                  trackEvent("cta_click", { location: "use_cases", action: "get_walkthrough" });
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
