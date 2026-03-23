import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  Globe,
  Check,
  X,
  Clock,
  Building2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { adminDomainClaimsPageCopy } from "@/lib/internal-copy";

interface DomainClaim {
  id: number;
  domain: string;
  status: string;
  requestedAt: string;
  organization: {
    id: number;
    name: string;
    slug: string;
  };
  requestedByUser: {
    id: number;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export default function AdminDomainClaimsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<DomainClaim | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch pending domain claims
  const { data: claims, isLoading } = useQuery<DomainClaim[]>({
    queryKey: ['admin', 'domain-claims'],
    queryFn: async () => {
      const res = await fetch('/api/admin/domain-claims', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch domain claims');
      return res.json();
    },
    staleTime: 1000 * 30,
  });

  // Respond to domain claim
  const respondMutation = useMutation({
    mutationFn: async ({ claimId, status, rejectionReason }: {
      claimId: number;
      status: 'approved' | 'rejected';
      rejectionReason?: string;
    }) => {
      return apiRequest('POST', `/api/admin/domain-claims/${claimId}/respond`, { status, rejectionReason });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain-claims'] });
      toast({
        title: variables.status === 'approved' ? adminDomainClaimsPageCopy.toasts.approvedTitle : adminDomainClaimsPageCopy.toasts.rejectedTitle,
        description: variables.status === 'approved'
          ? adminDomainClaimsPageCopy.toasts.approvedDescription
          : adminDomainClaimsPageCopy.toasts.rejectedDescription,
      });
      setRejectDialogOpen(false);
      setSelectedClaim(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: adminDomainClaimsPageCopy.toasts.errorTitle,
        description: error.message || adminDomainClaimsPageCopy.toasts.errorDescription,
        variant: "destructive",
      });
    },
  });

  // Auth check
  if (authLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return <Redirect to="/admin" />;
  }

  const handleApprove = (claim: DomainClaim) => {
    respondMutation.mutate({ claimId: claim.id, status: 'approved' });
  };

  const handleReject = (claim: DomainClaim) => {
    setSelectedClaim(claim);
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (!selectedClaim) return;
    respondMutation.mutate({
      claimId: selectedClaim.id,
      status: 'rejected',
      ...(rejectionReason ? { rejectionReason } : {}),
    });
  };

  const pendingClaims = claims?.filter(c => c.status === 'pending') || [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            {adminDomainClaimsPageCopy.header.title}
          </h1>
          <p className="text-muted-foreground">
            {adminDomainClaimsPageCopy.header.subtitle}
          </p>
        </div>

        {/* Stats Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">{adminDomainClaimsPageCopy.stats.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {pendingClaims.length} {adminDomainClaimsPageCopy.stats.awaitingReviewSuffix}
                  </p>
                </div>
              </div>
              <Badge variant={pendingClaims.length > 0 ? "default" : "secondary"}>
                {pendingClaims.length} {adminDomainClaimsPageCopy.stats.pendingSuffix}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Claims List */}
        <Card>
          <CardHeader>
            <CardTitle>{adminDomainClaimsPageCopy.list.title}</CardTitle>
            <CardDescription>
              {adminDomainClaimsPageCopy.list.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pendingClaims.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{adminDomainClaimsPageCopy.list.empty}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{adminDomainClaimsPageCopy.list.columns.domain}</TableHead>
                    <TableHead>{adminDomainClaimsPageCopy.list.columns.organization}</TableHead>
                    <TableHead>{adminDomainClaimsPageCopy.list.columns.requestedBy}</TableHead>
                    <TableHead>{adminDomainClaimsPageCopy.list.columns.requested}</TableHead>
                    <TableHead className="w-[150px]">{adminDomainClaimsPageCopy.list.columns.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{claim.domain}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{claim.organization.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {[claim.requestedByUser.firstName, claim.requestedByUser.lastName]
                              .filter(Boolean).join(' ') || claim.requestedByUser.username}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {claim.requestedByUser.username}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(claim.requestedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(claim)}
                            disabled={respondMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(claim)}
                            disabled={respondMutation.isPending}
                          >
                            {respondMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {adminDomainClaimsPageCopy.rejectDialog.title}
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && (
                  <>
                    {adminDomainClaimsPageCopy.rejectDialog.description} <strong>{selectedClaim.domain}</strong> for{" "}
                    <strong>{selectedClaim.organization.name}</strong>.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Label htmlFor="rejectionReason">{adminDomainClaimsPageCopy.rejectDialog.reasonLabel}</Label>
              <Textarea
                id="rejectionReason"
                placeholder={adminDomainClaimsPageCopy.rejectDialog.reasonPlaceholder}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-2"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmReject}
                disabled={respondMutation.isPending}
              >
                {respondMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Reject Claim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
