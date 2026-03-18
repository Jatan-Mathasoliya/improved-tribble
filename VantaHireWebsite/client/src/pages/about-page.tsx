import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Users, Zap, Shield, Heart, Check } from "lucide-react";

const values = [
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Speed Without Shortcuts",
    description: "Close roles in weeks, not months—without compromising on quality."
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Fairness Built-In",
    description: "Bias detection ensures diverse, qualified candidate pools every time."
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "AI + Human Expertise",
    description: "Smart algorithms surface candidates; humans validate every match."
  },
  {
    icon: <Heart className="w-6 h-6" />,
    title: "Customer Obsessed",
    description: "Your success is our success. We're in this together."
  }
];

export default function AboutPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <Layout>
      <Helmet>
        <title>About Us | VantaHire - AI + Human Expertise for Better Hiring</title>
        <meta name="description" content="Meet the team behind VantaHire. Founded by TA professionals from Adobe, Ericsson, and more—we're on a mission to make hiring faster, fairer, and less painful." />
        <link rel="canonical" href="https://vantahire.com/about" />
        <meta property="og:title" content="About Us | VantaHire - AI + Human Expertise for Better Hiring" />
        <meta property="og:description" content="Founded by recruiting veterans, VantaHire combines AI + human expertise to transform how teams hire." />
        <meta property="og:url" content="https://vantahire.com/about" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Us | VantaHire - AI + Human Expertise for Better Hiring" />
        <meta name="twitter:description" content="Founded by recruiting veterans, VantaHire combines AI + human expertise to transform how teams hire." />
        <meta name="twitter:image" content="https://vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "About", "item": "https://vantahire.com/about" }
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
              <span className="text-white">We Built VantaHire Because</span>
              <br />
              <span className="gradient-text-purple">Recruiters Deserve Better</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              And we're here to deliver it.
            </p>
          </div>

          {/* Our Story Section */}
          <div className="max-w-4xl mx-auto mb-20">
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 backdrop-blur-sm p-8 md:p-12 rounded-2xl border border-white/5">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Our Story</h2>
              <div className="space-y-4 text-lg text-white/80 leading-relaxed">
                <p>
                  We've been in your shoes. Our founders spent years building hiring teams at
                  <span className="text-primary font-semibold"> Adobe, Ericsson, Cloudera, and Cradlepoint</span>—and
                  got tired of the same broken processes.
                </p>
                <p>
                  Too much time wasted on unqualified resumes. Great candidates lost to slow processes.
                  Expensive agencies taking 20% for hires that didn't work out.
                </p>
                <p>
                  So we built VantaHire: AI + human expertise, working together to make hiring faster,
                  fairer, and actually enjoyable. With 20+ years of combined recruiting experience,
                  we know what works—and what doesn't.
                </p>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-20">
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))] to-[hsl(var(--vanta-dark))]/80 p-6 rounded-xl border border-white/5 text-center">
              <div className="text-4xl font-bold gradient-text-purple mb-2">20+</div>
              <div className="text-white/70">Years of Experience</div>
            </div>
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))] to-[hsl(var(--vanta-dark))]/80 p-6 rounded-xl border border-white/5 text-center">
              <div className="text-4xl font-bold gradient-text-purple mb-2">2,500+</div>
              <div className="text-white/70">Successful Placements</div>
            </div>
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))] to-[hsl(var(--vanta-dark))]/80 p-6 rounded-xl border border-white/5 text-center">
              <div className="text-4xl font-bold gradient-text-purple mb-2">96%</div>
              <div className="text-white/70">Client Satisfaction</div>
            </div>
          </div>

          {/* Our Values Section */}
          <div className="mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
              What We Stand For
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {values.map((value, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/5 hover:border-primary/30 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 text-primary">
                    {value.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{value.title}</h3>
                  <p className="text-white/70">{value.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mission Section */}
          <div className="max-w-3xl mx-auto text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Our Mission</h2>
            <p className="text-xl text-white/80 leading-relaxed">
              To make hiring <span className="text-primary font-semibold">faster</span>,
              <span className="text-primary font-semibold"> fairer</span>, and
              <span className="text-primary font-semibold"> less painful</span> for everyone involved.
            </p>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Ready to Join Our Journey?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Let's build something great together.
            </p>
            <Button
              variant="gold"
              size="lg"
              onClick={() => window.location.href = '/recruiter-auth'}
              className="rounded-full px-8 py-6 text-lg font-semibold"
            >
              Get Started Free
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
