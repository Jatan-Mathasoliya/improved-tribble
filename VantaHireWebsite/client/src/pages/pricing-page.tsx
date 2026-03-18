import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { usePlans, useSubscription, useCreateCheckout, useCreditPackConfig, formatPriceINR } from "@/hooks/use-subscription";
import { initiateCashfreeCheckout } from "@/lib/cashfree";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  X,
  Users,
  Building2,
  Zap,
  Loader2,
  ArrowRight,
  Mail,
  AlertCircle,
} from "lucide-react";

interface PlanFeature {
  name: string;
  free: boolean | string;
  pro: boolean | string;
  business: boolean | string;
}

// Static features organized by capability area (per PRICING.md)
const staticFeatures: PlanFeature[] = [
  // Jobs & Sourcing
  { name: "Talent Search (natural language)", free: true, pro: true, business: true },
  { name: "Fit scoring + skill breakdowns", free: true, pro: true, business: true },
  { name: "Identity confidence badges", free: true, pro: true, business: true },
  // Pipeline
  { name: "Kanban pipeline per job", free: true, pro: true, business: true },
  { name: "AI application screening", free: true, pro: true, business: true },
  { name: "Bulk pipeline actions", free: false, pro: true, business: true },
  { name: "Stage-based automation", free: false, pro: true, business: true },
  { name: "Stale candidate alerts", free: false, pro: true, business: true },
  // Outreach
  { name: "Email outreach + templates", free: true, pro: true, business: true },
  { name: "WhatsApp outreach (Cloud API)", free: false, pro: true, business: true },
  { name: "Automated stage triggers", free: false, pro: true, business: true },
  { name: "Message audit trail", free: false, pro: true, business: true },
  // Collaboration
  { name: "Client Feedback Portal", free: false, pro: true, business: true },
  { name: "Shareable shortlist links", free: false, pro: true, business: true },
  // Analytics
  { name: "Basic job analytics", free: true, pro: true, business: true },
  { name: "Pipeline velocity + conversion", free: false, pro: true, business: true },
  { name: "Source performance tracking", free: false, pro: true, business: true },
  // Admin & Security
  { name: "Priority support", free: false, pro: true, business: true },
  { name: "SSO / SAML", free: false, pro: false, business: true },
  { name: "API access", free: false, pro: false, business: true },
  { name: "SLA guarantee", free: false, pro: false, business: true },
];

export default function PricingPage() {
  const { user } = useAuth();
  const { data: organization } = useOrganization();
  const { data: plans } = usePlans();
  const { data: subscription } = useSubscription();
  const { data: creditPackConfig } = useCreditPackConfig();
  const createCheckout = useCreateCheckout();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Public checkout fields (for non-logged-in users)
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [gstin, setGstin] = useState('');
  const [checkoutMode, setCheckoutMode] = useState<'public' | 'create-org' | 'existing'>('public');
  const [requiresLogin, setRequiresLogin] = useState(false);

  const freePlan = plans?.find(p => p.name === 'free') as any;
  const proPlan = plans?.find(p => p.name === 'pro') as any;
  const isLoggedIn = !!user;
  const hasOrg = !!organization;
  const isOwner = organization?.membership?.role === 'owner';
  const currentPlan = subscription?.plan?.name || 'free';
  const isPro = currentPlan === 'pro';
  const creditPackLabel = creditPackConfig
    ? `Add extra ${creditPackConfig.creditsPerPack}-credit packs at ${formatPriceINR(creditPackConfig.pricePerPack)}`
    : 'Extra credit packs available';

  const formatMetric = (value?: number | null) => {
    if (typeof value !== "number" || value <= 0) {
      return "—";
    }
    return String(value);
  };

  // Dynamic plan values from API
  const freeCredits = freePlan?.rateLimits?.monthlyCredits;
  const proCredits = proPlan?.rateLimits?.monthlyCredits;

  // Build features array with dynamic values
  const features: PlanFeature[] = [
    { name: "Active jobs", free: "5", pro: "Unlimited", business: "Unlimited" },
    { name: "Included AI credits / month", free: formatMetric(freeCredits), pro: formatMetric(proCredits), business: "Custom" },
    { name: "Team members", free: "1", pro: "Unlimited", business: "Unlimited" },
    ...staticFeatures,
  ];

  // Mutation for public checkout
  const publicCheckout = useMutation({
    mutationFn: async (data: { email: string; orgName: string; planId: number; seats: number; billingCycle: 'monthly' | 'annual'; gstin?: string }) => {
      const res = await fetch('/api/subscription/checkout-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create checkout');
      }
      return res.json();
    },
  });

  // Mutation for create-org checkout (requires CSRF token since it's authenticated)
  const createOrgCheckout = useMutation({
    mutationFn: async (data: { orgName: string; planId: number; seats: number; billingCycle: 'monthly' | 'annual'; gstin?: string }) => {
      // Fetch CSRF token first
      const csrfRes = await fetch('/api/csrf-token', { credentials: 'include' });
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.token;

      const res = await fetch('/api/subscription/checkout-create-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create checkout');
      }
      return res.json();
    },
  });

  useEffect(() => { setIsVisible(true); }, []);

  const handleSelectPro = () => {
    if (!proPlan) return;

    setSelectedPlan(proPlan.id);
    setRequiresLogin(false);

    // Determine checkout mode based on user state
    if (!isLoggedIn) {
      // Case 1: Not logged in - public checkout
      setCheckoutMode('public');
      setEmail('');
      setOrgName('');
    } else if (!hasOrg) {
      // Case 3: Logged in but no org - create org + checkout
      setCheckoutMode('create-org');
      setOrgName('');
    } else if (isOwner) {
      // Case 2: Logged in with org, is owner - existing checkout
      setCheckoutMode('existing');
    } else {
      // Logged in with org but not owner - can't upgrade
      toast({
        title: "Permission Required",
        description: "Only the organization owner can manage billing. Please contact your organization owner to upgrade.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutDialogOpen(true);
  };

  const handleCheckout = async () => {
    if (!selectedPlan) return;

    try {
      let sessionId: string | undefined;
      let paymentLink: string | undefined;

      if (checkoutMode === 'public') {
        // Validate email and org name
        if (!email || !email.includes('@')) {
          toast({ title: "Error", description: "Please enter a valid email address", variant: "destructive" });
          return;
        }
        if (!orgName || orgName.length < 2) {
          toast({ title: "Error", description: "Please enter an organization name", variant: "destructive" });
          return;
        }

        const result = await publicCheckout.mutateAsync({
          email,
          orgName,
          planId: selectedPlan,
          seats,
          billingCycle,
          ...(gstin ? { gstin } : {}),
        });

        if (result.requiresLogin) {
          setRequiresLogin(true);
          return;
        }

        sessionId = result.sessionId;
        paymentLink = result.paymentLink;
      } else if (checkoutMode === 'create-org') {
        if (!orgName || orgName.length < 2) {
          toast({ title: "Error", description: "Please enter an organization name", variant: "destructive" });
          return;
        }

        const result = await createOrgCheckout.mutateAsync({
          orgName,
          planId: selectedPlan,
          seats,
          billingCycle,
          ...(gstin ? { gstin } : {}),
        });

        sessionId = result.sessionId;
        paymentLink = result.paymentLink;
      } else {
        // Existing org checkout
        const result = await createCheckout.mutateAsync({
          planId: selectedPlan,
          seats,
          billingCycle,
        });

        sessionId = result.sessionId;
        paymentLink = result.paymentLink;
      }

      if (sessionId) {
        // Use Cashfree SDK for checkout (required for production)
        await initiateCashfreeCheckout(sessionId, paymentLink);
      } else if (paymentLink) {
        // Fallback to direct redirect (works in sandbox)
        window.location.href = paymentLink;
      } else {
        toast({
          title: "Error",
          description: "Failed to create checkout session",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      // Handle auth errors specifically
      if (error.message?.includes('401') || error.message?.toLowerCase().includes('auth')) {
        setCheckoutDialogOpen(false);
        setLocation('/recruiter-auth?redirect=/pricing');
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    }
  };

  const isCheckoutPending = publicCheckout.isPending || createOrgCheckout.isPending || createCheckout.isPending;

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@vantahire.com?subject=VantaHire%20Business%20Plan%20Inquiry';
  };

  const renderFeatureValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="h-5 w-5 text-green-500 mx-auto" />
      ) : (
        <X className="h-5 w-5 text-white/20 mx-auto" />
      );
    }
    return <span className="text-center text-white">{value}</span>;
  };

  return (
    <Layout>
      <Helmet>
        <title>Pricing | VantaHire - Simple, Transparent Pricing</title>
        <meta name="description" content="Simple pricing. No surprises. Start free, upgrade when your team grows. No long contracts. AI sourcing, WhatsApp outreach, client portal, and pipeline management included." />
        <link rel="canonical" href="https://vantahire.com/pricing" />
        <meta property="og:title" content="Pricing | VantaHire - Simple, Transparent Pricing" />
        <meta property="og:description" content="Simple pricing. No surprises. Start free, upgrade when your team grows." />
        <meta property="og:url" content="https://vantahire.com/pricing" />
        <meta property="og:type" content="website" />
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
              <span className="text-white">Simple pricing.</span>
              <br />
              <span className="gradient-text-purple">No surprises.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Start free. Upgrade when your team grows. No long contracts. No hidden fees.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-20 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-white/70" />
                  <h3 className="text-xl font-bold text-white">Free</h3>
                </div>
                <p className="text-white/60 text-sm">Get started in minutes</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">
                  {formatPriceINR(0)}
                  <span className="text-base font-normal text-white/50">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Up to 5 active jobs
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  AI sourcing with fit scoring
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Talent Search (natural language)
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Kanban pipeline per job
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Email outreach with templates
                </li>
              </ul>
              {currentPlan === 'free' && isLoggedIn ? (
                <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10" onClick={() => setLocation('/recruiter-auth')}>
                  Get Started
                </Button>
              )}
            </div>

            {/* Growth Plan */}
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-6 rounded-xl border-2 border-primary relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">
                Most Popular
              </Badge>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-white">Growth</h3>
                </div>
                <p className="text-white/60 text-sm">Scale your hiring output</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">
                  {proPlan ? formatPriceINR(proPlan.pricePerSeatMonthly) : '...'}
                  <span className="text-base font-normal text-white/50">/seat/month</span>
                </div>
                <p className="text-xs text-white/50 mt-1">+ applicable taxes | Save with annual billing</p>
              </div>
              <p className="text-xs text-white/50 mb-4">Everything in Free, plus:</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Unlimited active jobs
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {formatMetric(proCredits)} included AI credits/month
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {creditPackLabel}
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  WhatsApp outreach (Cloud API)
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Client Feedback Portal
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Stage-based automation triggers
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Pipeline velocity + analytics
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Unlimited team members
                </li>
              </ul>
              {isPro ? (
                <Button className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="gold" className="w-full" onClick={handleSelectPro}>
                  Upgrade to Growth
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>

            {/* Business Plan */}
            <div className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-white/70" />
                  <h3 className="text-xl font-bold text-white">Enterprise</h3>
                </div>
                <p className="text-white/60 text-sm">Custom fit for large teams</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">Custom</div>
                <p className="text-xs text-white/50 mt-1">Tailored to your needs</p>
              </div>
              <p className="text-xs text-white/50 mb-4">Everything in Growth, plus:</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Dedicated account manager
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  SSO / SAML authentication
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  API access + custom integrations
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  SLA guarantee
                </li>
                <li className="flex items-center gap-2 text-white/80 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Invoice billing (GST-compliant)
                </li>
              </ul>
              <Button variant="outlinePurple" className="w-full" onClick={handleContactSales}>
                Contact Sales
              </Button>
            </div>
          </div>

          {/* Feature Comparison */}
          <div className="mb-20 max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-white mb-8">Compare plans side by side</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left py-4 px-4 font-medium text-white">Feature</th>
                    <th className="py-4 px-4 font-medium text-center w-32 text-white">Free</th>
                    <th className="py-4 px-4 font-medium text-center w-32 bg-primary/10 text-white">Growth</th>
                    <th className="py-4 px-4 font-medium text-center w-32 text-white">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((feature, index) => (
                    <tr key={feature.name} className={`border-b border-white/5 ${index % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                      <td className="py-3 px-4 text-white/80">{feature.name}</td>
                      <td className="py-3 px-4 text-center">{renderFeatureValue(feature.free)}</td>
                      <td className="py-3 px-4 text-center bg-primary/5">{renderFeatureValue(feature.pro)}</td>
                      <td className="py-3 px-4 text-center">{renderFeatureValue(feature.business)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-white mb-8">Pricing questions, answered.</h2>
            <div className="space-y-6">
              {[
                { q: "Is there really a free plan?", a: "Yes. No credit card required. No time limit. Start using VantaHire today and upgrade when you need more capacity." },
                { q: "Can I switch plans anytime?", a: "Yes. Upgrade or downgrade at any time. No long-term contracts. Month-to-month billing on all plans." },
                { q: "How does seat-based pricing work?", a: "You pay per recruiter who actively uses the platform. Team members who only view reports or dashboards do not count as seats." },
                { q: "Do you offer annual discounts?", a: "Yes. Annual billing saves compared to monthly. Toggle between monthly and annual above to see the difference." },
                { q: "What payment methods do you accept?", a: "Credit card and UPI for Growth via Cashfree. Enterprise customers can pay by invoice. GST-compliant invoicing is available for India." },
                { q: "What happens when I hit my Free plan limits?", a: "You will be notified before you reach your limit. No disruption to active jobs or candidates. Upgrade to Growth to remove limits." },
                { q: "Is my data safe?", a: "VantaHire enforces a three-tier privacy model. Your uploaded resumes and candidate data stay private to your organization. Only candidates who opt in are discoverable by other customers." },
                { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings. No cancellation fees. Your data remains accessible for 30 days after cancellation." },
              ].map((faq, i) => (
                <div key={i} className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/10">
                  <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                  <p className="text-white/70">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Start hiring with the right plan.
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Every plan includes AI sourcing, fit scoring, and a recruiter-grade pipeline. Pick the one that fits your team today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="gold"
                size="lg"
                onClick={() => setLocation('/recruiter-auth')}
                className="rounded-full px-8 py-6 text-lg font-semibold"
              >
                Start Free
              </Button>
              <Button
                variant="outlinePurple"
                size="lg"
                onClick={() => setLocation('/demo')}
                className="rounded-full px-8 py-6 text-lg"
              >
                Book a Demo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upgrade to Growth</DialogTitle>
            <DialogDescription>
              {checkoutMode === 'public'
                ? "Enter your details to get started."
                : checkoutMode === 'create-org'
                ? "Create your organization and start your subscription."
                : "Choose your seat count and billing cycle."}
            </DialogDescription>
          </DialogHeader>

          {requiresLogin ? (
            <div className="py-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Account already exists
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    An account with this email already has an organization. Please log in to manage your subscription.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => { setRequiresLogin(false); setEmail(''); }} className="flex-1">
                  Use Different Email
                </Button>
                <Button onClick={() => setLocation('/recruiter-auth?redirect=/org/billing')} className="flex-1">
                  Log In
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                {/* Email field - only for public checkout */}
                {checkoutMode === 'public' && (
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We'll send your receipt and login details here.
                    </p>
                  </div>
                )}

                {/* Org name - for public and create-org modes */}
                {(checkoutMode === 'public' || checkoutMode === 'create-org') && (
                  <div className="space-y-2">
                    <Label>Organization Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Acme Inc"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Number of Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={seats}
                    onChange={(e) => setSeats(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Growth includes {formatMetric(proCredits)} AI credits per month per organization. Seats are billed separately, and {creditPackConfig ? `extra ${creditPackConfig.creditsPerPack}-credit packs are available at ${formatPriceINR(creditPackConfig.pricePerPack)}` : 'extra credit packs are available'}.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Billing Cycle</Label>
                  <Select value={billingCycle} onValueChange={(v: 'monthly' | 'annual') => setBillingCycle(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual (Save 17%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Optional GSTIN field */}
                {(checkoutMode === 'public' || checkoutMode === 'create-org') && (
                  <div className="space-y-2">
                    <Label>GSTIN (Optional)</Label>
                    <Input
                      placeholder="22AAAAA0000A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    />
                    <p className="text-xs text-muted-foreground">
                      For GST invoice. Leave blank for tax-inclusive invoice.
                    </p>
                  </div>
                )}

                {proPlan && (
                  <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="flex justify-between">
                      <span>Total</span>
                      <span className="font-bold">
                        {formatPriceINR(
                          billingCycle === 'monthly'
                            ? proPlan.pricePerSeatMonthly * seats
                            : proPlan.pricePerSeatAnnual * seats
                        )}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{billingCycle === 'monthly' ? 'month' : 'year'}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      + 18% GST applicable
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCheckoutDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCheckout} disabled={isCheckoutPending}>
                  {isCheckoutPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Continue to Payment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
