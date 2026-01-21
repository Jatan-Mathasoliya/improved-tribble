import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlans, useSubscription, useCreateCheckout, formatPriceINR } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import {
  Check,
  X,
  Users,
  Building2,
  Zap,
  Loader2,
  ArrowRight,
} from "lucide-react";

interface PlanFeature {
  name: string;
  free: boolean | string;
  pro: boolean | string;
  business: boolean | string;
}

const features: PlanFeature[] = [
  { name: "Active job postings", free: "5", pro: "Unlimited", business: "Unlimited" },
  { name: "Team members", free: "1", pro: "Pay per seat", business: "Custom" },
  { name: "AI credits per seat/month", free: "5", pro: "600", business: "Custom" },
  { name: "Credit rollover", free: "15 max", pro: "1,800 max", business: "Custom" },
  { name: "Candidate management", free: true, pro: true, business: true },
  { name: "Application tracking", free: true, pro: true, business: true },
  { name: "Email notifications", free: true, pro: true, business: true },
  { name: "Co-recruiter sharing", free: true, pro: true, business: true },
  { name: "Hiring manager access", free: true, pro: true, business: true },
  { name: "Custom forms", free: true, pro: true, business: true },
  { name: "Client shortlists", free: true, pro: true, business: true },
  { name: "Advanced analytics", free: false, pro: true, business: true },
  { name: "Priority support", free: false, pro: true, business: true },
  { name: "Custom domain", free: false, pro: false, business: true },
  { name: "Dedicated instance", free: false, pro: false, business: true },
  { name: "SLA guarantee", free: false, pro: false, business: true },
];

export default function PricingPage() {
  const { user } = useAuth();
  const { data: plans } = usePlans();
  const { data: subscription } = useSubscription();
  const createCheckout = useCreateCheckout();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const proPlan = plans?.find(p => p.name === 'pro');
  const isLoggedIn = !!user;
  const currentPlan = subscription?.plan?.name || 'free';
  const isPro = currentPlan === 'pro';

  const handleSelectPro = () => {
    if (!isLoggedIn) {
      setLocation('/auth?redirect=/pricing');
      return;
    }

    if (proPlan) {
      setSelectedPlan(proPlan.id);
      setCheckoutDialogOpen(true);
    }
  };

  const handleCheckout = async () => {
    if (!selectedPlan) return;

    try {
      const result = await createCheckout.mutateAsync({
        planId: selectedPlan,
        seats,
        billingCycle,
      });

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast({
          title: "Error",
          description: "Failed to create checkout session",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    }
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@vantahire.com?subject=VantaHire%20Business%20Plan%20Inquiry';
  };

  const renderFeatureValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="h-5 w-5 text-green-500 mx-auto" />
      ) : (
        <X className="h-5 w-5 text-slate-300 mx-auto" />
      );
    }
    return <span className="text-center">{value}</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container max-w-6xl py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, no surprises.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Free
              </CardTitle>
              <CardDescription>Perfect for solo recruiters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold">
                {formatPriceINR(0)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  1 team member
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  5 AI credits per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Up to 5 active jobs
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Basic ATS features
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {currentPlan === 'free' ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setLocation('/auth')}>
                  Get Started
                </Button>
              )}
            </CardFooter>
          </Card>

          <Card className="border-2 border-primary relative">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
              Most Popular
            </Badge>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Pro
              </CardTitle>
              <CardDescription>For growing teams</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold">
                {proPlan ? formatPriceINR(proPlan.pricePerSeatMonthly) : '...'}
                <span className="text-sm font-normal text-muted-foreground">/seat/month</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Save 17% with annual billing
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited team members
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  600 AI credits per seat/month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited active jobs
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Priority support
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              {isPro ? (
                <Button className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button className="w-full" onClick={handleSelectPro}>
                  Upgrade to Pro
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Business
              </CardTitle>
              <CardDescription>For large organizations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold">
                Custom
              </div>
              <p className="text-xs text-muted-foreground">
                Tailored to your needs
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Dedicated instance
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Custom AI credit allocation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Custom domain
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  SLA guarantee
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Dedicated support
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={handleContactSales}>
                Contact Sales
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-medium">Feature</th>
                  <th className="py-4 px-4 font-medium text-center w-32">Free</th>
                  <th className="py-4 px-4 font-medium text-center w-32 bg-primary/5">Pro</th>
                  <th className="py-4 px-4 font-medium text-center w-32">Business</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr key={feature.name} className={index % 2 === 0 ? 'bg-slate-50' : ''}>
                    <td className="py-3 px-4">{feature.name}</td>
                    <td className="py-3 px-4 text-center">{renderFeatureValue(feature.free)}</td>
                    <td className="py-3 px-4 text-center bg-primary/5">{renderFeatureValue(feature.pro)}</td>
                    <td className="py-3 px-4 text-center">{renderFeatureValue(feature.business)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">What are AI credits?</h3>
              <p className="text-muted-foreground">
                AI credits are used for AI-powered features like job description generation,
                resume analysis, and candidate matching. Each AI operation consumes credits.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Can I change my plan anytime?</h3>
              <p className="text-muted-foreground">
                Yes! You can upgrade at any time and the change takes effect immediately with prorated billing.
                Downgrades take effect at the end of your current billing period.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
              <p className="text-muted-foreground">
                We accept UPI, credit/debit cards, and net banking through our secure payment partner Cashfree.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Do you offer refunds?</h3>
              <p className="text-muted-foreground">
                We offer a 7-day money-back guarantee for new Pro subscriptions.
                Contact support within 7 days of your first payment for a full refund.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to Pro</DialogTitle>
            <DialogDescription>
              Choose your seat count and billing cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                Each seat gets 600 AI credits per month.
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
            {proPlan && (
              <div className="p-4 bg-slate-50 rounded-lg">
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
            <Button onClick={handleCheckout} disabled={createCheckout.isPending}>
              {createCheckout.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Continue to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
