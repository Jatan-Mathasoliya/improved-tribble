import { useState } from "react";
import Layout from "@/components/Layout";
import { initiateCashfreeCheckout } from "@/lib/cashfree";
import {
  useSubscription,
  usePlans,
  useSeatUsage,
  useInvoices,
  useCreateCheckout,
  useCancelSubscription,
  useReactivateSubscription,
  formatPriceINR,
} from "@/hooks/use-subscription";
import { useOrganization } from "@/hooks/use-organization";
import { useAiCredits } from "@/hooks/use-ai-credits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Users,
  Sparkles,
  Download,
  AlertCircle,
  Check,
  Loader2,
  Calendar,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export default function OrgBillingPage() {
  const { data: orgData } = useOrganization();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: plans } = usePlans();
  const { data: seatUsage } = useSeatUsage();
  const { data: invoices } = useInvoices();
  const { data: credits } = useAiCredits();
  const createCheckout = useCreateCheckout();
  const cancelSubscription = useCancelSubscription();
  const reactivateSubscription = useReactivateSubscription();
  const { toast } = useToast();

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const isOwner = orgData?.membership?.role === 'owner';
  const proPlan = plans?.find(p => p.name === 'pro');
  const currentPlanName = subscription?.plan?.displayName || 'Free';
  const isPro = subscription?.plan?.name === 'pro';

  const handleUpgrade = async () => {
    if (!selectedPlan) return;

    try {
      const result = await createCheckout.mutateAsync({
        planId: selectedPlan,
        seats,
        billingCycle,
      });

      if (result.sessionId) {
        // Use Cashfree SDK for checkout (required for production)
        await initiateCashfreeCheckout(result.sessionId);
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

  const handleCancel = async () => {
    try {
      await cancelSubscription.mutateAsync();
      toast({
        title: "Subscription cancelled",
        description: "Your subscription will end at the current billing period.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivateSubscription.mutateAsync();
      toast({
        title: "Subscription reactivated",
        description: "Your subscription has been reactivated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate subscription",
        variant: "destructive",
      });
    }
  };

  const creditUsagePercent = credits ? Math.min(100, Math.round((credits.used / credits.allocated) * 100)) : 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your subscription, seats, and billing
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                {isPro ? "Pro subscription" : "Free plan"}
              </CardDescription>
            </div>
            <Badge variant={isPro ? "default" : "secondary"} className="text-lg px-3 py-1">
              {currentPlanName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription && (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4" />
                  <span className="text-sm">Seats</span>
                </div>
                <p className="text-2xl font-bold">{seatUsage?.assigned || 1} / {seatUsage?.purchased || 1}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Billing Cycle</span>
                </div>
                <p className="text-2xl font-bold capitalize">{subscription.billingCycle}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">Next Billing</span>
                </div>
                <p className="text-lg font-bold">
                  {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}

          {subscription?.status === 'past_due' && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Payment Failed</p>
                <p className="text-sm text-amber-700">
                  Please update your payment method to avoid service interruption.
                </p>
              </div>
            </div>
          )}

          {subscription?.cancelAtPeriodEnd && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 border rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Cancellation Scheduled</p>
                <p className="text-sm text-muted-foreground">
                  Your subscription will end on {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                </p>
              </div>
              {isOwner && (
                <Button variant="outline" size="sm" onClick={handleReactivate}>
                  Reactivate
                </Button>
              )}
            </div>
          )}
        </CardContent>
        {isOwner && !isPro && (
          <CardFooter className="border-t pt-6">
            <Button onClick={() => {
              setSelectedPlan(proPlan?.id || null);
              setUpgradeDialogOpen(true);
            }}>
              Upgrade to Pro
            </Button>
          </CardFooter>
        )}
        {isOwner && isPro && !subscription?.cancelAtPeriodEnd && (
          <CardFooter className="border-t pt-6">
            <Button variant="outline" onClick={handleCancel}>
              Cancel Subscription
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* AI Credits */}
      {credits && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Credits
            </CardTitle>
            <CardDescription>
              Your monthly AI feature usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{credits.used} used</span>
                <span>{credits.remaining} remaining</span>
              </div>
              <Progress value={creditUsagePercent} className="h-2" />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Monthly allocation: {credits.allocated} credits</span>
              {credits.rollover > 0 && (
                <span>+{credits.rollover} rolled over</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison */}
      {!isPro && proPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade to Pro</CardTitle>
            <CardDescription>
              Unlock advanced features and more AI credits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3">Free</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    1 seat (fixed)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    5 AI credits/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Basic ATS features
                  </li>
                </ul>
              </div>
              <div className="p-4 border-2 border-primary rounded-lg relative">
                <Badge className="absolute -top-2 right-4">Popular</Badge>
                <h3 className="font-semibold mb-3">Pro</h3>
                <p className="text-2xl font-bold mb-3">
                  {formatPriceINR(proPlan.pricePerSeatMonthly)}
                  <span className="text-sm font-normal text-muted-foreground">/seat/month</span>
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Unlimited seats
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    600 AI credits/seat/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    All features included
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {invoices && invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber || `INV-${invoice.id}`}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{formatPriceINR(invoice.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'completed' ? 'default' : 'secondary'}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.invoiceUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                Minimum 1 seat. You can add more later.
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
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpgrade} disabled={createCheckout.isPending}>
              {createCheckout.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Continue to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}
