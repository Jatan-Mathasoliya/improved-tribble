import { useState } from "react";
import {
  useOrganization,
  useUpdateOrganization,
} from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Globe,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function OrgSettingsPage() {
  const { data: orgData, isLoading } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingPincode, setBillingPincode] = useState("");
  const [billingContactEmail, setBillingContactEmail] = useState("");
  const [billingContactName, setBillingContactName] = useState("");
  const [gstin, setGstin] = useState("");

  const isOwner = orgData?.membership?.role === 'owner';
  const isAdmin = orgData?.membership?.role === 'admin' || isOwner;

  // Initialize form when data loads
  useState(() => {
    if (orgData?.organization) {
      const org = orgData.organization;
      setName(org.name || "");
      setBillingName(org.billingName || "");
      setBillingAddress(org.billingAddress || "");
      setBillingCity(org.billingCity || "");
      setBillingState(org.billingState || "");
      setBillingPincode(org.billingPincode || "");
      setBillingContactEmail(org.billingContactEmail || "");
      setBillingContactName(org.billingContactName || "");
      setGstin(org.gstin || "");
    }
  });

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await updateOrg.mutateAsync({ name: name.trim() });
      toast({
        title: "Settings saved",
        description: "Organization name updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateOrg.mutateAsync({
        billingName: billingName.trim() || null,
        billingAddress: billingAddress.trim() || null,
        billingCity: billingCity.trim() || null,
        billingState: billingState.trim() || null,
        billingPincode: billingPincode.trim() || null,
        billingContactEmail: billingContactEmail.trim() || null,
        billingContactName: billingContactName.trim() || null,
        gstin: gstin.trim() || null,
      });
      toast({
        title: "Billing info saved",
        description: "Billing information updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update billing info",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              You are not part of any organization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const org = orgData.organization;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization's settings and billing information
        </p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSaveGeneral}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                placeholder="Acme Inc"
              />
              {!isOwner && (
                <p className="text-xs text-muted-foreground">
                  Only the organization owner can change the name.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Organization Slug</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-slate-100 rounded text-sm">
                  {org.slug}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(org.slug)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This is your unique organization identifier.
              </p>
            </div>
          </CardContent>
          {isOwner && (
            <CardFooter className="border-t pt-6">
              <Button type="submit" disabled={updateOrg.isPending || !name.trim()}>
                {updateOrg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>

      {/* Domain Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Email Domain
          </CardTitle>
          <CardDescription>
            Claim your company email domain to enable automatic join requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {org.domain ? (
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                {org.domainVerified ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium">@{org.domain}</p>
                  <p className="text-sm text-muted-foreground">
                    {org.domainVerified
                      ? "Domain verified - users can request to join"
                      : "Pending verification by admin"
                    }
                  </p>
                </div>
              </div>
              <Badge variant={org.domainVerified ? "default" : "secondary"}>
                {org.domainVerified ? "Verified" : "Pending"}
              </Badge>
            </div>
          ) : (
            <div className="text-center py-6">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">
                No domain claimed yet. Claim your company domain to let employees request to join.
              </p>
              {isOwner && (
                <Button variant="outline" asChild>
                  <a href="/org/domain-request">Request Domain Verification</a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Billing Information
          </CardTitle>
          <CardDescription>
            Information for invoices and tax purposes
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSaveBilling}>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingContactName">Billing Contact Name</Label>
                <Input
                  id="billingContactName"
                  value={billingContactName}
                  onChange={(e) => setBillingContactName(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingContactEmail">Billing Contact Email</Label>
                <Input
                  id="billingContactEmail"
                  type="email"
                  value={billingContactEmail}
                  onChange={(e) => setBillingContactEmail(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="billing@company.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingName">Legal Name (for invoices)</Label>
              <Input
                id="billingName"
                value={billingName}
                onChange={(e) => setBillingName(e.target.value)}
                disabled={!isAdmin}
                placeholder="Company Legal Name LLP"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN (Optional)</Label>
              <Input
                id="gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                disabled={!isAdmin}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground">
                Provide GSTIN to receive GST-compliant invoices. Without GSTIN, invoices will be tax-inclusive.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingAddress">Billing Address</Label>
              <Textarea
                id="billingAddress"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                disabled={!isAdmin}
                placeholder="123 Business Street, Suite 100"
                rows={2}
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingCity">City</Label>
                <Input
                  id="billingCity"
                  value={billingCity}
                  onChange={(e) => setBillingCity(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Mumbai"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingState">State</Label>
                <Input
                  id="billingState"
                  value={billingState}
                  onChange={(e) => setBillingState(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Maharashtra"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingPincode">Pincode</Label>
                <Input
                  id="billingPincode"
                  value={billingPincode}
                  onChange={(e) => setBillingPincode(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="400001"
                  maxLength={6}
                />
              </div>
            </div>
          </CardContent>
          {isAdmin && (
            <CardFooter className="border-t pt-6">
              <Button type="submit" disabled={updateOrg.isPending}>
                {updateOrg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Billing Info
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>
    </div>
  );
}
