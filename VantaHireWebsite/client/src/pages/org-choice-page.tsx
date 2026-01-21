import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization, useCreateOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DomainOrgMatch {
  id: number;
  name: string;
  domain: string;
}

/**
 * Onboarding page shown after registration.
 * User can: Create org, Join via invite, or Request to join (if domain matches)
 */
export default function OrgChoicePage() {
  const { user } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useOrganization();
  const createOrg = useCreateOrganization();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Parse invite token from URL query params
  const inviteFromUrl = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('invite') || '';
  }, [searchString]);

  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice');
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [domainOrg, setDomainOrg] = useState<DomainOrgMatch | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState(false);

  // Auto-switch to join mode if invite token is in URL
  useEffect(() => {
    if (inviteFromUrl) {
      setMode('join');
      setInviteCode(inviteFromUrl);
    }
  }, [inviteFromUrl]);

  // Redirect if already in org
  useEffect(() => {
    if (!orgLoading && orgData) {
      if (orgData.membership.seatAssigned) {
        setLocation("/recruiter-dashboard");
      } else {
        setLocation("/blocked/seat-removed");
      }
    }
  }, [orgData, orgLoading, setLocation]);

  // Check if user's email domain matches an org
  useEffect(() => {
    if (user?.username) {
      checkDomainOrg();
    }
  }, [user?.username]);

  const checkDomainOrg = async () => {
    setCheckingDomain(true);
    try {
      const res = await fetch('/api/organizations/by-email-domain', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setDomainOrg(data);
        }
      }
    } catch (err) {
      console.error('Error checking domain org:', err);
    } finally {
      setCheckingDomain(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    try {
      await createOrg.mutateAsync({ name: orgName.trim() });
      toast({
        title: "Organization created",
        description: "Your organization has been created successfully.",
      });
      setLocation("/recruiter-dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    }
  };

  const handleJoinViaInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    try {
      // Get CSRF token
      const csrfRes = await fetch('/api/csrf-token', { credentials: 'include' });
      const { token } = await csrfRes.json();

      const res = await fetch(`/api/invites/${inviteCode.trim()}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': token,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Invalid invite code');
      }

      toast({
        title: "Joined organization",
        description: "Welcome to the team!",
      });
      setLocation("/recruiter-dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to join organization",
        variant: "destructive",
      });
    }
  };

  const handleRequestJoin = async () => {
    if (!domainOrg) return;

    setRequestingJoin(true);
    try {
      const csrfRes = await fetch('/api/csrf-token', { credentials: 'include' });
      const { token } = await csrfRes.json();

      const res = await fetch(`/api/organizations/request-join/${domainOrg.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': token,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send request');
      }

      toast({
        title: "Request sent",
        description: `Your request to join ${domainOrg.name} has been sent. The owner will review it.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRequestingJoin(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to VantaHire!</h1>
          <p className="text-muted-foreground mt-2">
            {mode === 'choice' ? "Let's get you set up. Choose how you'd like to get started." : null}
            {mode === 'create' ? "Create a new workspace for your team." : null}
            {mode === 'join' ? "Join an existing team with your invite code." : null}
          </p>
        </div>

        {mode === 'choice' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setMode('create')}
            >
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Create Organization</CardTitle>
                <CardDescription>
                  Start your own workspace and invite your team
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setMode('join')}
            >
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Link2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Join Organization</CardTitle>
                <CardDescription>
                  Have an invite code? Join an existing team
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}

        {mode !== 'choice' && domainOrg && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-amber-900">
                    Organization for @{domainOrg.domain} exists
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    {domainOrg.name} is already using VantaHire. You can request to join them.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-amber-300 hover:bg-amber-100"
                    onClick={handleRequestJoin}
                    disabled={requestingJoin}
                  >
                    {requestingJoin ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Request to Join {domainOrg.name}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === 'create' && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your Organization</CardTitle>
              <CardDescription>
                This will be your team's workspace. You can invite others after setup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    placeholder="e.g., Acme Recruiting"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMode('choice')}
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={createOrg.isPending || !orgName.trim()}>
                    {createOrg.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Create Organization
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {mode === 'join' && (
          <Card>
            <CardHeader>
              <CardTitle>Join with Invite Code</CardTitle>
              <CardDescription>
                Enter the invite code you received from your team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinViaInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Invite Code</Label>
                  <Input
                    id="inviteCode"
                    placeholder="Enter your invite code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMode('choice')}
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={!inviteCode.trim()}>
                    Join Organization
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
