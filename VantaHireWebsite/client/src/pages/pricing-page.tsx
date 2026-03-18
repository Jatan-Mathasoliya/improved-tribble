import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import {
  useCommercialConfig,
  useSubscription,
  useCreateCheckout,
  calculateTaxAmount,
  calculateTotalWithTax,
  formatPriceINR,
} from "@/hooks/use-subscription";
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

export default function PricingPage() {
  const { user } = useAuth();
  const { data: organization } = useOrganization();
  const { data: commercialConfig } = useCommercialConfig();
  const { data: subscription } = useSubscription();
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

  const plans = commercialConfig?.plans;
  const creditPackConfig = commercialConfig?.creditPack;
  const billingConfig = commercialConfig?.billing;
  const freePlan = plans?.find(p => p.name === 'free') as any;
  const proPlan = plans?.find(p => p.name === 'pro') as any;
  const freePlanCard = commercialConfig?.planCards?.free;
  const proPlanCard = commercialConfig?.planCards?.pro;
  const businessPlanCard = commercialConfig?.planCards?.business;
  const isLoggedIn = !!user;
  const hasOrg = !!organization;
  const isOwner = organization?.membership?.role === 'owner';
  const currentPlan = subscription?.plan?.name || 'free';
  const isPro = currentPlan === 'pro';
  const creditPackLabel = creditPackConfig
    ? `Add extra ${creditPackConfig.creditsPerPack}-credit packs at ${formatPriceINR(creditPackConfig.pricePerPack)}`
    : 'Extra credit packs available';
  const gstRate = billingConfig?.gstRate || 0;
  const taxEnabled = !!billingConfig?.taxEnabled;
  const subtotal = proPlan
    ? (billingCycle === 'monthly' ? proPlan.pricePerSeatMonthly : proPlan.pricePerSeatAnnual) * seats
    : 0;
  const gstAmount = calculateTaxAmount(subtotal, gstRate);
  const totalWithTax = calculateTotalWithTax(subtotal, gstRate);

  const formatMetric = (value?: number | null) => {
    if (typeof value !== "number" || value <= 0) {
      return "—";
    }
    return String(value);
  };

  // Dynamic plan values from API
  const freeCredits = freePlan?.rateLimits?.monthlyCredits;
  const proCredits = proPlan?.rateLimits?.monthlyCredits;
  const comparisonRows = commercialConfig?.comparisonRows ?? [];
  const faqs = commercialConfig?.faqs ?? [];

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
                <p className="text-white/60 text-sm">{freePlanCard?.summary || "Get started in minutes"}</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">
                  {formatPriceINR(0)}
                  <span className="text-base font-normal text-white/50">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-6">
                {(freePlanCard?.highlights ?? []).map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {highlight}
                  </li>
                ))}
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
                <p className="text-white/60 text-sm">{proPlanCard?.summary || "Scale your hiring output"}</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">
                  {proPlan ? formatPriceINR(proPlan.pricePerSeatMonthly) : '...'}
                  <span className="text-base font-normal text-white/50">/seat/month</span>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  {taxEnabled ? `+ GST (${gstRate}%) | Save with annual billing` : 'No additional tax configured | Save with annual billing'}
                </p>
              </div>
              <p className="text-xs text-white/50 mb-4">Everything in Free, plus:</p>
              <ul className="space-y-3 mb-6">
                {(proPlanCard?.highlights ?? []).map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {highlight.includes("top-ups") ? creditPackLabel : highlight}
                  </li>
                ))}
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
                <p className="text-white/60 text-sm">{businessPlanCard?.summary || "Custom fit for large teams"}</p>
              </div>
              <div className="mb-6">
                <div className="text-4xl font-bold text-white">Custom</div>
                <p className="text-xs text-white/50 mt-1">Tailored to your needs</p>
              </div>
              <p className="text-xs text-white/50 mb-4">Everything in Growth, plus:</p>
              <ul className="space-y-3 mb-6">
                {(businessPlanCard?.highlights ?? []).slice(1).map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {highlight}
                  </li>
                ))}
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
                  {comparisonRows.map((feature, index) => (
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
              {faqs.map((faq, i) => (
                <div key={i} className="bg-gradient-to-br from-[hsl(var(--vanta-dark))]/90 to-[hsl(var(--vanta-dark))]/70 p-6 rounded-xl border border-white/10">
                  <h3 className="font-semibold text-white mb-2">{faq.question}</h3>
                  <p className="text-white/70">{faq.answer}</p>
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
                    Growth includes {formatMetric(proCredits)} AI credits per seat per month, pooled across the organization. With {seats} seat{seats === 1 ? "" : "s"}, that is {proCredits * seats} included credits per month. {commercialConfig?.seatPolicies?.seatAddCredits.summary} {creditPackConfig ? `Extra ${creditPackConfig.creditsPerPack}-credit packs are available at ${formatPriceINR(creditPackConfig.pricePerPack)}.` : 'Extra credit packs are available.'}
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
                      Optional. Add GSTIN if you want it printed on the invoice.
                    </p>
                  </div>
                )}

                {proPlan && (
                  <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>{formatPriceINR(subtotal)}</span>
                    </div>
                    {taxEnabled && (
                      <div className="mt-2 flex justify-between text-sm">
                        <span>GST ({gstRate}%)</span>
                        <span>{formatPriceINR(gstAmount)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between">
                      <span>Total</span>
                      <span className="font-bold">
                        {formatPriceINR(totalWithTax)}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{billingCycle === 'monthly' ? 'month' : 'year'}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {taxEnabled
                        ? `GST (${gstRate}%) is added at checkout.`
                        : 'No additional tax is configured.'}
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
