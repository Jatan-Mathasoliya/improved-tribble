import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import {
  Settings2,
  Building2,
  Loader2,
  ArrowLeft,
  CreditCard,
  Sparkles,
  ToggleLeft,
  History,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Tab components
import SubscriptionTab from "@/components/admin/SubscriptionTab";
import CreditsTab from "@/components/admin/CreditsTab";
import FeaturesTab from "@/components/admin/FeaturesTab";
import HistoryTab from "@/components/admin/HistoryTab";

interface FeatureInfo {
  key: string;
  name: string;
  description: string;
  category: "core" | "ai" | "advanced" | "enterprise";
  defaultByPlan: Record<string, boolean>;
}

interface OrgFeatures {
  organizationId: number;
  organizationName: string;
  planName: string;
  planDisplayName: string;
  features: Record<string, { enabled: boolean; source: "plan" | "override" }>;
  overrides: Record<string, boolean>;
}

interface Organization {
  id: number;
  name: string;
  slug: string;
  subscription?: {
    planName: string;
    seats: number;
    status: string;
    currentPeriodEnd: string | null;
  };
}

interface SubscriptionPlan {
  id: number;
  name: string;
  displayName: string;
}

interface SubscriptionInfo {
  id: number;
  planId: number;
  planName: string;
  planDisplayName: string;
  seats: number;
  status: string;
  billingCycle: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  adminOverride: boolean;
  bonusCredits: number;
  customCreditLimit: number | null;
}

async function fetchFeatures(): Promise<FeatureInfo[]> {
  const res = await fetch("/api/admin/features", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch features");
  const data = await res.json();
  return data.features;
}

async function fetchOrganizations(): Promise<Organization[]> {
  const res = await fetch("/api/admin/organizations?limit=100", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch organizations");
  const data = await res.json();
  return data.organizations;
}

async function fetchOrgFeatures(orgId: number): Promise<OrgFeatures> {
  const res = await fetch(`/api/admin/organizations/${orgId}/features`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch organization features");
  return res.json();
}

async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch("/api/subscription/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

async function fetchOrgSubscription(orgId: number): Promise<SubscriptionInfo | null> {
  const res = await fetch(`/api/admin/organizations/${orgId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch organization");
  const data = await res.json();

  if (!data.subscription) return null;

  return {
    id: data.subscription.id,
    planId: data.subscription.planId,
    planName: data.subscription.plan?.name || 'free',
    planDisplayName: data.subscription.plan?.displayName || 'Free',
    seats: data.subscription.seats,
    status: data.subscription.status,
    billingCycle: data.subscription.billingCycle,
    currentPeriodStart: data.subscription.currentPeriodStart,
    currentPeriodEnd: data.subscription.currentPeriodEnd,
    adminOverride: data.subscription.adminOverride,
    bonusCredits: data.subscription.bonusCredits || 0,
    customCreditLimit: data.subscription.customCreditLimit,
  };
}

export default function AdminOrgControlsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [activeTab, setActiveTab] = useState("subscription");

  const { data: features, isLoading: featuresLoading } = useQuery({
    queryKey: ["admin", "features"],
    queryFn: fetchFeatures,
  });

  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: fetchOrganizations,
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription", "plans"],
    queryFn: fetchPlans,
  });

  const { data: orgFeatures, isLoading: orgFeaturesLoading } = useQuery({
    queryKey: ["admin", "org-features", selectedOrgId],
    queryFn: () => fetchOrgFeatures(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["admin", "org-subscription", selectedOrgId],
    queryFn: () => fetchOrgSubscription(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const selectedOrg = organizations?.find(org => org.id === selectedOrgId);

  useEffect(() => {
    if (selectedOrgId && !changeReason.trim()) {
      setChangeReason("Admin override");
    }
  }, [selectedOrgId]);

  if (authLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!user || user.role !== "super_admin") {
    return <Redirect to="/admin" />;
  }

  const isLoading = featuresLoading || orgsLoading || plansLoading;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Settings2 className="h-6 w-6" />
                Organization Controls
              </h1>
              <p className="text-muted-foreground">
                Manage subscriptions, credits, and features for organizations
              </p>
            </div>
          </div>
        </div>

        {/* Organization Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Organization
            </CardTitle>
            <CardDescription>
              Choose an organization to manage its settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orgsLoading ? (
              <Skeleton className="h-10 w-full max-w-md" />
            ) : (
              <div className="space-y-4">
                <Select
                  value={selectedOrgId?.toString() || ""}
                  onValueChange={(value) => setSelectedOrgId(parseInt(value))}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select an organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.name} ({org.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Organization Summary */}
                {selectedOrg && (
                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex-1 grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Organization:</span>
                        <p className="font-medium">{selectedOrg.name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Plan:</span>
                        <p className="font-medium">
                          {subscription?.planDisplayName || selectedOrg.subscription?.planName || 'Free'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Seats:</span>
                        <p className="font-medium flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {subscription?.seats || selectedOrg.subscription?.seats || 1}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p>
                          <Badge variant={
                            (subscription?.status || selectedOrg.subscription?.status) === 'active'
                              ? 'default'
                              : 'destructive'
                          }>
                            {subscription?.status || selectedOrg.subscription?.status || 'active'}
                          </Badge>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Reason (for features tab) */}
        {selectedOrgId && (
          <Card>
            <CardHeader>
              <CardTitle>Change Reason</CardTitle>
              <CardDescription>
                Required for feature overrides (recorded in the audit log).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="Describe why this change is needed"
                rows={2}
              />
            </CardContent>
          </Card>
        )}

        {/* Tabs Content */}
        {selectedOrgId ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 max-w-xl">
              <TabsTrigger value="subscription" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Subscription</span>
              </TabsTrigger>
              <TabsTrigger value="credits" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Credits</span>
              </TabsTrigger>
              <TabsTrigger value="features" className="flex items-center gap-2">
                <ToggleLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Features</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="subscription">
              <SubscriptionTab
                orgId={selectedOrgId}
                subscription={subscription || null}
                plans={plans || []}
                isLoading={subscriptionLoading || plansLoading}
              />
            </TabsContent>

            <TabsContent value="credits">
              <CreditsTab
                orgId={selectedOrgId}
                planName={subscription?.planName || 'free'}
              />
            </TabsContent>

            <TabsContent value="features">
              <FeaturesTab
                orgId={selectedOrgId}
                features={features}
                orgFeatures={orgFeatures}
                changeReason={changeReason}
                isLoading={orgFeaturesLoading}
              />
            </TabsContent>

            <TabsContent value="history">
              <HistoryTab orgId={selectedOrgId} />
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Select an organization above to manage its controls
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
