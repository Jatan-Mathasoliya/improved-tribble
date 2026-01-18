import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Check, X, ChevronDown } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const plans = [
  {
    name: "Free",
    price: "₹0",
    period: "/month",
    description: "Perfect for trying out VantaHire",
    cta: "Start Free",
    highlighted: false,
    features: [
      { name: "1 active job posting", included: true },
      { name: "Basic candidate management", included: true },
      { name: "Email support", included: true },
      { name: "AI candidate scoring", included: false },
      { name: "Bulk actions", included: false },
      { name: "Analytics dashboard", included: false },
      { name: "Team collaboration", included: false }
    ]
  },
  {
    name: "Pro",
    price: "₹999",
    period: "/month",
    description: "Everything you need to hire faster",
    cta: "Start Free Trial",
    highlighted: true,
    features: [
      { name: "Unlimited job postings", included: true },
      { name: "AI candidate scoring", included: true },
      { name: "Bulk actions & automation", included: true },
      { name: "Analytics dashboard", included: true },
      { name: "Team collaboration", included: true },
      { name: "Priority support", included: true },
      { name: "Custom pipeline stages", included: true }
    ]
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large teams with custom needs",
    cta: "Contact Sales",
    highlighted: false,
    features: [
      { name: "Everything in Pro", included: true },
      { name: "Volume discounts", included: true },
      { name: "Dedicated account manager", included: true },
      { name: "Custom integrations", included: true },
      { name: "SLA guarantees", included: true },
      { name: "On-premise deployment", included: true },
      { name: "Custom training", included: true }
    ]
  }
];

const faqs = [
  {
    question: "Can I try before I buy?",
    answer: "Yes! Our Free plan lets you try VantaHire with one active job. When you're ready for more, upgrade to Pro and get a 14-day free trial."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards, UPI, and bank transfers for annual plans. Enterprise customers can also pay via invoice."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Absolutely. You can cancel your subscription at any time. Your access continues until the end of your billing period."
  },
  {
    question: "Do you offer discounts for startups?",
    answer: "Yes! Early-stage startups can get 50% off Pro for the first year. Contact us to learn more about our startup program."
  },
  {
    question: "Is there a limit on team members?",
    answer: "No per-seat pricing! Invite your entire team on Pro and Enterprise plans without paying extra per user."
  }
];

export default function PricingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleCta = (plan: typeof plans[0]) => {
    const planKey = plan.name.toLowerCase();
    trackEvent("plan_cta_click", { plan: planKey, source: "pricing_page" });
    if (plan.name === "Enterprise") {
      window.open('https://cal.com/vantahire/quick-connect', '_blank');
    } else {
      window.location.href = '/recruiter-auth';
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Pricing | VantaHire - Simple Pricing, No Surprises</title>
        <meta name="description" content="Start free, scale when you're ready. VantaHire pricing starts at ₹0/month with unlimited jobs on Pro at ₹999/month." />
        <link rel="canonical" href="https://www.vantahire.com/pricing" />
        <meta property="og:title" content="Pricing | VantaHire - Simple Pricing, No Surprises" />
        <meta property="og:description" content="Simple, transparent pricing. No per-seat fees. Start free and upgrade when you're ready." />
        <meta property="og:url" content="https://www.vantahire.com/pricing" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pricing | VantaHire - Simple Pricing, No Surprises" />
        <meta name="twitter:description" content="Simple, transparent pricing. No per-seat fees. Start free and upgrade when you're ready." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.vantahire.com/" },
              { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://www.vantahire.com/pricing" }
            ]
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "Can I try before I buy?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes! Our Free plan lets you try VantaHire with one active job. When you're ready for more, upgrade to Pro and get a 14-day free trial."
                }
              },
              {
                "@type": "Question",
                "name": "What payment methods do you accept?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "We accept all major credit cards, UPI, and bank transfers for annual plans. Enterprise customers can also pay via invoice."
                }
              },
              {
                "@type": "Question",
                "name": "Can I cancel anytime?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Absolutely. You can cancel your subscription at any time. Your access continues until the end of your billing period."
                }
              },
              {
                "@type": "Question",
                "name": "Do you offer discounts for startups?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes! Early-stage startups can get 50% off Pro for the first year. Contact us to learn more about our startup program."
                }
              },
              {
                "@type": "Question",
                "name": "Is there a limit on team members?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "No per-seat pricing! Invite your entire team on Pro and Enterprise plans without paying extra per user."
                }
              }
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
          <div className="text-center mb-16 pt-8">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mx-auto mb-6"></div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="text-white">Simple Pricing,</span>
              <br />
              <span className="gradient-text-purple">No Surprises</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Start free. Scale when you're ready.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-20">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-2xl p-8 ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary'
                    : 'bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 border border-white/5'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-white text-sm font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className={feature.included ? 'text-white/80' : 'text-muted-foreground/50'}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlighted ? 'gold' : 'outlinePurple'}
                  className="w-full rounded-full py-6"
                  onClick={() => handleCta(plan)}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl font-bold text-white text-center mb-12">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 rounded-xl border border-white/5 overflow-hidden"
                >
                  <button
                    className="w-full px-6 py-4 flex items-center justify-between text-left"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <span className="text-white font-medium">{faq.question}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform ${
                        openFaq === index ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === index && (
                    <div className="px-6 pb-4">
                      <p className="text-white/70">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Still Have Questions?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Our team is happy to help you find the right plan.
            </p>
            <Button
              variant="outlinePurple"
              size="lg"
              onClick={() => window.open('https://cal.com/vantahire/quick-connect', '_blank')}
              className="rounded-full px-8 py-6 text-lg"
            >
              Talk to Sales
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
