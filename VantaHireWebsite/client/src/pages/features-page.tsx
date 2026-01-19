import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import {
  Search,
  FileSearch,
  Brain,
  Shield,
  Kanban,
  Zap,
  Mail,
  Calendar,
  MessageSquare,
  BarChart3,
  Clock,
  TrendingUp
} from "lucide-react";

const featureCategories = [
  {
    title: "Sourcing",
    description: "Find the right candidates faster",
    features: [
      {
        icon: <Search className="w-5 h-5" />,
        title: "Job Board Distribution",
        description: "Post to multiple job boards with one click"
      },
      {
        icon: <Brain className="w-5 h-5" />,
        title: "AI-Powered Matching",
        description: "Our algorithms find candidates you'd miss"
      },
      {
        icon: <FileSearch className="w-5 h-5" />,
        title: "Smart Job Descriptions",
        description: "AI-assisted JD writing that attracts top talent"
      }
    ]
  },
  {
    title: "Screening",
    description: "Qualify candidates automatically",
    features: [
      {
        icon: <FileSearch className="w-5 h-5" />,
        title: "Resume Parsing",
        description: "Extract skills, experience, and education automatically"
      },
      {
        icon: <TrendingUp className="w-5 h-5" />,
        title: "Skill Scoring",
        description: "AI-powered fit scores for every candidate"
      },
      {
        icon: <Shield className="w-5 h-5" />,
        title: "Bias Detection",
        description: "Built-in checks for fairer hiring decisions"
      }
    ]
  },
  {
    title: "Pipeline",
    description: "Manage candidates with ease",
    features: [
      {
        icon: <Kanban className="w-5 h-5" />,
        title: "Kanban Boards",
        description: "Visual pipeline management with drag-and-drop"
      },
      {
        icon: <Zap className="w-5 h-5" />,
        title: "Stage Automation",
        description: "Auto-move candidates based on actions"
      },
      {
        icon: <Clock className="w-5 h-5" />,
        title: "Bulk Actions",
        description: "Move, email, or archive multiple candidates at once"
      }
    ]
  },
  {
    title: "Communication",
    description: "Stay connected with candidates",
    features: [
      {
        icon: <Mail className="w-5 h-5" />,
        title: "Email Templates",
        description: "Pre-built templates for every stage"
      },
      {
        icon: <Calendar className="w-5 h-5" />,
        title: "Interview Scheduling",
        description: "Calendar integration for easy booking"
      },
      {
        icon: <MessageSquare className="w-5 h-5" />,
        title: "Team Notes",
        description: "Shared feedback and candidate notes"
      }
    ]
  },
  {
    title: "Analytics",
    description: "Measure what matters",
    features: [
      {
        icon: <Clock className="w-5 h-5" />,
        title: "Time-to-Hire",
        description: "Track how long it takes to fill roles"
      },
      {
        icon: <BarChart3 className="w-5 h-5" />,
        title: "Source Effectiveness",
        description: "See which channels deliver the best candidates"
      },
      {
        icon: <TrendingUp className="w-5 h-5" />,
        title: "Pipeline Health",
        description: "Monitor bottlenecks and conversion rates"
      }
    ]
  }
];

export default function FeaturesPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Features | VantaHire - Everything You Need to Hire Faster</title>
        <meta name="description" content="Explore VantaHire's powerful features: AI matching, automated screening, pipeline management, team collaboration, and analytics—all in one platform." />
        <link rel="canonical" href="https://www.vantahire.com/features" />
        <meta property="og:title" content="Features | VantaHire - Everything You Need to Hire Faster" />
        <meta property="og:description" content="Powerful features, zero complexity. See everything VantaHire can do for your hiring process." />
        <meta property="og:url" content="https://www.vantahire.com/features" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Features | VantaHire - Everything You Need to Hire Faster" />
        <meta name="twitter:description" content="Powerful features, zero complexity. See everything VantaHire can do for your hiring process." />
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
              <span className="text-white">Everything You Need to</span>
              <br />
              <span className="gradient-text-purple">Hire Faster</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features, zero complexity.
            </p>
          </div>

          {/* Feature Categories */}
          <div className="space-y-16 mb-20">
            {featureCategories.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{category.title}</h2>
                  <p className="text-muted-foreground">{category.description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  {category.features.map((feature, featureIndex) => (
                    <div
                      key={featureIndex}
                      className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/5 hover:border-primary/30 transition-all duration-300"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center mb-4 text-primary">
                        {feature.icon}
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-white/70 text-sm">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Ready to Try These Features?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Start free and explore everything VantaHire has to offer.
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
                Try It Free
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => window.location.href = '/pricing'}
                className="rounded-full px-8 py-6 text-lg"
              >
                View Pricing
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
