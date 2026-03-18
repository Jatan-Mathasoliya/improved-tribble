import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  Building2,
  Users,
  CreditCard,
  BarChart3,
  ArrowLeft,
  Globe,
  CheckCircle,
  XCircle,
  Clock,
  Crown,
  Shield,
  User,
  Loader2,
  Calendar,
  Mail,
  Briefcase,
  FileText,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface OrganizationMember {
  id: number;
  userId: number;
  role: string;
  seatAssigned: boolean;
  joinedAt: string;
  lastActivityAt: string | null;
  user: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface SubscriptionPlan {
  id: number;
  name: string;
  displayName: string;
}

interface Subscription {
  id: number;
  seats: number;
  status: string;
  billingCycle: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: SubscriptionPlan;
}

interface OrgStats {
  jobsCount: number;
  activeJobsCount: number;
  applicationsCount: number;
  candidatesCount: number;
}

interface OrgCreditDetails {
  effectiveLimit: number;
  usedThisPeriod: number;
  remaining: number;
}

interface OrganizationDetail {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  domain: string | null;
  domainVerified: boolean;
  billingName: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPincode: string | null;
  billingContactEmail: string | null;
  gstin: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMember[];
  subscription: Subscription | null;
  stats: OrgStats;
}

async function fetchOrganization(id: string): Promise<OrganizationDetail> {
  const res = await fetch(`/api/admin/organizations/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch organization");
  return res.json();
}

async function fetchOrgCredits(id: string): Promise<OrgCreditDetails> {
  const res = await fetch(`/api/admin/organizations/${id}/credits`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch organization credits");
  return res.json();
}

function getRoleBadge(role: string) {
  switch (role) {
    case "owner":
      return <Badge className="bg-amber-500"><Crown className="h-3 w-3 mr-1" />Owner</Badge>;
    case "admin":
      return <Badge className="bg-blue-500"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
    default:
      return <Badge variant="secondary"><User className="h-3 w-3 mr-1" />Member</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500">Active</Badge>;
    case "past_due":
      return <Badge variant="destructive">Past Due</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    case "trialing":
      return <Badge className="bg-blue-500">Trial</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function AdminOrganizationDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [match, params] = useRoute("/admin/organizations/:id");
  const orgId = params?.id;

  const { data: org, isLoading, error } = useQuery<OrganizationDetail>({
    queryKey: ["admin", "organization", orgId],
    queryFn: () => fetchOrganization(orgId!),
    enabled: !!orgId,
  });
  const { data: creditDetails } = useQuery<OrgCreditDetails>({
    queryKey: ["admin", "organization", orgId, "credits"],
    queryFn: () => fetchOrgCredits(orgId!),
    enabled: !!orgId,
  });

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

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[300px]" />
            <Skeleton className="h-[300px]" />
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      </Layout>
    );
  }

  if (error || !org) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <p className="text-muted-foreground">Organization not found</p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/admin/organizations">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Organizations
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const seatedMembers = org.members.filter(m => m.seatAssigned).length;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/organizations">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="h-6 w-6" />
                {org.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                Created {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {org.isActive ? (
              <Badge className="bg-green-500">Active</Badge>
            ) : (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{org.members.length}</div>
              <p className="text-xs text-muted-foreground">{seatedMembers} seated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{org.subscription?.plan.displayName || "Free"}</div>
              <p className="text-xs text-muted-foreground">{org.subscription?.seats || 1} seats</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {creditDetails ? `${creditDetails.usedThisPeriod} / ${creditDetails.effectiveLimit}` : "—"}
              </div>
              <p className="text-xs text-muted-foreground">used this period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Domain</CardTitle>
            </CardHeader>
            <CardContent>
              {org.domain ? (
                <>
                  <div className="text-lg font-bold flex items-center gap-1">
                    @{org.domain}
                    {org.domainVerified ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {org.domainVerified ? "Verified" : "Pending"}
                  </p>
                </>
              ) : (
                <div className="text-muted-foreground">Not set</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Organization Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Slug</p>
                  <p className="font-medium">{org.slug}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(org.createdAt), "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Billing Contact</p>
                  <p className="font-medium">{org.billingContactEmail || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">GSTIN</p>
                  <p className="font-medium">{org.gstin || "—"}</p>
                </div>
              </div>
              {org.billingAddress && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground text-sm">Billing Address</p>
                  <p className="font-medium text-sm">
                    {org.billingName && <>{org.billingName}<br /></>}
                    {org.billingAddress}
                    {org.billingCity && <>, {org.billingCity}</>}
                    {org.billingState && <>, {org.billingState}</>}
                    {org.billingPincode && <> - {org.billingPincode}</>}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscription Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {org.subscription ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Plan</p>
                    <p className="font-medium">{org.subscription.plan.displayName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <div>{getStatusBadge(org.subscription.status)}</div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Billing Cycle</p>
                    <p className="font-medium capitalize">{org.subscription.billingCycle}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Seats</p>
                    <p className="font-medium">{seatedMembers} / {org.subscription.seats}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current Period</p>
                    <p className="font-medium text-xs">
                      {format(new Date(org.subscription.currentPeriodStart), "MMM d")} - {format(new Date(org.subscription.currentPeriodEnd), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Renews</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(org.subscription.currentPeriodEnd), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No active subscription (Free tier)</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Members List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members ({org.members.length})
            </CardTitle>
            <CardDescription>
              All members of this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Credit Access</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {member.user.firstName} {member.user.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.user.username}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>
                      {member.seatAssigned ? (
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Assigned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <XCircle className="h-3 w-3 mr-1" />
                          No Seat
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.seatAssigned ? "Uses shared org balance" : "No access"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(member.joinedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {member.lastActivityAt
                        ? formatDistanceToNow(new Date(member.lastActivityAt), { addSuffix: true })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Activity/Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Organization Activity
            </CardTitle>
            <CardDescription>
              Hiring activity and analytics for this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Briefcase className="h-4 w-4" />
                  Total Jobs
                </div>
                <p className="text-2xl font-bold">{org.stats?.jobsCount || 0}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Briefcase className="h-4 w-4 text-green-500" />
                  Active Jobs
                </div>
                <p className="text-2xl font-bold">{org.stats?.activeJobsCount || 0}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <FileText className="h-4 w-4" />
                  Applications
                </div>
                <p className="text-2xl font-bold">{org.stats?.applicationsCount || 0}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Users className="h-4 w-4" />
                  Candidates
                </div>
                <p className="text-2xl font-bold">{org.stats?.candidatesCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
