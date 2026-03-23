import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Users, TrendingUp, Shield, Mail, CheckCircle, UserPlus } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { OnboardingStatus } from "@/hooks/use-onboarding-status";
import { recruiterAuthPageCopy } from "@/lib/internal-copy";

// Type for invite details response
interface InviteDetails {
  organizationName: string;
  email: string;
  role: string;
  expiresAt: string;
  inviterName: string;
}

export default function RecruiterAuth() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  // Parse redirect URL and invite token from query params
  const { redirectUrl, inviteToken } = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const redirect = params.get('redirect');
    const invite = params.get('invite');
    return {
      // Only allow internal redirects (starting with /)
      redirectUrl: redirect && redirect.startsWith('/') ? redirect : null,
      inviteToken: invite || null,
    };
  }, [searchString]);

  // Controlled tab state - default to register if invite token present
  const [activeTab, setActiveTab] = useState<string>(inviteToken ? "register" : "login");

  // Fetch invite details if token present (64 hex chars)
  const { data: inviteDetails, isLoading: inviteLoading, error: inviteError } = useQuery<InviteDetails>({
    queryKey: ["/api/invites", inviteToken],
    queryFn: async () => {
      const res = await fetch(`/api/invites/${inviteToken}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid invite");
      }
      return res.json();
    },
    enabled: !!inviteToken && inviteToken.length === 64,
    retry: false,
  });

  const [loginData, setLoginData] = useState({
    username: "",
    password: ""
  });

  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "recruiter",
    inviteToken: inviteToken || undefined,
  });

  // Pre-fill email from invite when details are loaded
  useEffect(() => {
    if (inviteDetails?.email) {
      setRegisterData(prev => ({ ...prev, username: inviteDetails.email }));
    }
  }, [inviteDetails]);

  // Update inviteToken in registerData if it changes
  useEffect(() => {
    setRegisterData(prev => ({ ...prev, inviteToken: inviteToken || undefined }));
  }, [inviteToken]);

  // State for email verification flow
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Check onboarding status for recruiters
  // Returns: OnboardingStatus on success, { error: true } on failure, null for non-recruiters
  const checkOnboardingAndRedirect = useCallback(async (): Promise<OnboardingStatus | { error: true } | null> => {
    if (!user || user.role !== "recruiter") return null;

    try {
      const res = await fetch("/api/onboarding-status", { credentials: "include" });
      if (res.ok) {
        const status: OnboardingStatus = await res.json();
        return status;
      }
      // Non-OK response - treat as error, don't allow bypass
      return { error: true };
    } catch {
      // Network/fetch error - treat as error, don't allow bypass
      return { error: true };
    }
  }, [user]);

  // Redirect if already logged in as recruiter, admin, or hiring manager (shared portal)
  useEffect(() => {
    if (!user) return;

    // If there's an invite token, redirect to org choice to accept the invite
    if (inviteToken && user.role === "recruiter") {
      setLocation(`/org/choice?invite=${inviteToken}`);
      return;
    }

    // For recruiters, ALWAYS check onboarding status before any redirect
    // This ensures onboarding cannot be bypassed via redirectUrl param
    if (user.role === "recruiter") {
      checkOnboardingAndRedirect().then((status) => {
        if (!status || 'error' in status) {
          // Status check failed - safe fallback to onboarding page
          // The onboarding page will re-check and redirect if already complete
          setLocation("/onboarding");
          return;
        }
        if (status.needsOnboarding) {
          // Onboarding required - ignore redirectUrl, go to onboarding
          setLocation(`/onboarding?step=${status.currentStep}`);
        } else {
          // Onboarding complete - honor redirectUrl if provided, else dashboard
          setLocation(redirectUrl || "/recruiter-dashboard");
        }
      });
      return;
    }

    // For super_admin, honor redirectUrl or go to admin
    if (user.role === "super_admin") {
      setLocation(redirectUrl || "/admin");
      return;
    }

    // Other role redirects
    if (user.role === "hiring_manager") {
      setLocation("/hiring-manager");
    }
  }, [user, setLocation, redirectUrl, inviteToken, checkOnboardingAndRedirect]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Allow recruiters, admins, and hiring managers to use this portal
      await loginMutation.mutateAsync({ ...loginData, expectedRole: ['recruiter', 'super_admin', 'hiring_manager'] });
    } catch (error: any) {
      // Check if this is an email verification error
      const errorData = error?.response?.data || error;
      if (errorData?.code === 'EMAIL_NOT_VERIFIED' || error?.message?.includes('verify your email')) {
        setVerificationNeeded(true);
        setVerificationEmail(errorData?.email || loginData.username);
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await registerMutation.mutateAsync(registerData);
    // Check if registration requires verification
    if ('requiresVerification' in result && result.requiresVerification) {
      setRegistrationSuccess(true);
      setVerificationEmail(registerData.username);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail || resendLoading) return;

    setResendLoading(true);
    try {
      const response = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, inviteToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to send verification email.");
      }
      toast({
        title: recruiterAuthPageCopy.toasts.verificationSentTitle,
        description: data.message || recruiterAuthPageCopy.toasts.verificationSentDescription,
      });
    } catch (error: any) {
      toast({
        title: recruiterAuthPageCopy.toasts.errorTitle,
        description: error?.message || recruiterAuthPageCopy.toasts.verificationFailed,
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="public-theme min-h-screen bg-background text-foreground">
      <Header />
      <div className="container mx-auto px-4 pt-32 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Hero Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
                {recruiterAuthPageCopy.hero.title}
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                {recruiterAuthPageCopy.hero.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Briefcase className="h-8 w-8 text-[#7B38FB]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">{recruiterAuthPageCopy.hero.features[0].title}</h3>
                  <p className="text-muted-foreground text-sm">{recruiterAuthPageCopy.hero.features[0].description}</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-[#FF5BA8]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">{recruiterAuthPageCopy.hero.features[1].title}</h3>
                  <p className="text-muted-foreground text-sm">{recruiterAuthPageCopy.hero.features[1].description}</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-[#00D2FF]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">{recruiterAuthPageCopy.hero.features[2].title}</h3>
                  <p className="text-muted-foreground text-sm">{recruiterAuthPageCopy.hero.features[2].description}</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Shield className="h-8 w-8 text-[#90EE90]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">{recruiterAuthPageCopy.hero.features[3].title}</h3>
                  <p className="text-muted-foreground text-sm">{recruiterAuthPageCopy.hero.features[3].description}</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-muted-foreground text-sm">
                {recruiterAuthPageCopy.hero.candidatePrompt} <Button variant="link" className="text-[#7B38FB] p-0 h-auto" onClick={() => setLocation("/candidate-auth")}>
                  {recruiterAuthPageCopy.hero.candidateLink}
                </Button>
              </p>
            </div>
          </div>

          {/* Right Column - Auth Form */}
          <div className="flex justify-center">
            <Card className="w-full max-w-md bg-muted/50 backdrop-blur-sm border-border">
              {/* Registration Success State */}
              {registrationSuccess && (
                <>
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-success" />
                      </div>
                    </div>
                    <CardTitle className="text-foreground text-2xl">{recruiterAuthPageCopy.verification.checkEmailTitle}</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {recruiterAuthPageCopy.verification.checkEmailDescriptionPrefix} <span className="text-foreground font-medium">{verificationEmail}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm text-center">
                      {recruiterAuthPageCopy.verification.checkEmailHint}
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        className="w-full border-border text-foreground hover:bg-muted/50"
                      >
                        {resendLoading ? recruiterAuthPageCopy.verification.sending : recruiterAuthPageCopy.verification.resend}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setRegistrationSuccess(false); setVerificationEmail(""); }}
                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      >
                        {recruiterAuthPageCopy.verification.backToLogin}
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* Email Verification Needed State (from login attempt) */}
              {verificationNeeded && !registrationSuccess && (
                <>
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center">
                        <Mail className="h-8 w-8 text-warning" />
                      </div>
                    </div>
                    <CardTitle className="text-foreground text-2xl">{recruiterAuthPageCopy.verification.verifyTitle}</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {recruiterAuthPageCopy.verification.verifyDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm text-center">
                      {recruiterAuthPageCopy.verification.verifyHintPrefix} <span className="text-foreground font-medium">{verificationEmail}</span> {recruiterAuthPageCopy.verification.verifyHintSuffix}
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        className="w-full border-border text-foreground hover:bg-muted/50"
                      >
                        {resendLoading ? recruiterAuthPageCopy.verification.sending : recruiterAuthPageCopy.verification.resend}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setVerificationNeeded(false); setVerificationEmail(""); }}
                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      >
                        {recruiterAuthPageCopy.verification.backToLogin}
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* Normal Auth Form */}
              {!registrationSuccess && !verificationNeeded && (
              <>
              {/* Invite Banner */}
              {inviteToken && inviteDetails && (
                <div className="bg-gradient-to-r from-[#7B38FB]/10 to-[#FF5BA8]/10 border-b border-border px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <UserPlus className="h-5 w-5 text-[#7B38FB]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {recruiterAuthPageCopy.invite.prefix} <span className="text-[#7B38FB]">{inviteDetails.organizationName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {recruiterAuthPageCopy.invite.byPrefix} {inviteDetails.inviterName} as {inviteDetails.role}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Invite Error */}
              {inviteToken && inviteError && (
                <div className="bg-destructive/10 border-b border-destructive/30 px-6 py-4">
                  <p className="text-sm text-destructive">
                    {(inviteError as Error).message || recruiterAuthPageCopy.invite.invalid}
                  </p>
                </div>
              )}

              <CardHeader className="text-center">
                <CardTitle className="text-foreground text-2xl">
                  {inviteDetails ? recruiterAuthPageCopy.invite.createAccount : recruiterAuthPageCopy.card.title}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {inviteDetails
                    ? `${recruiterAuthPageCopy.invite.joinPrefix} ${inviteDetails.organizationName}`
                    : recruiterAuthPageCopy.card.description
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                  <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                    <TabsTrigger value="login" className="data-[state=active]:bg-muted/60 text-foreground">
                      {recruiterAuthPageCopy.card.signIn}
                    </TabsTrigger>
                    <TabsTrigger value="register" className="data-[state=active]:bg-muted/60 text-foreground">
                      {recruiterAuthPageCopy.card.register}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="text-foreground">{recruiterAuthPageCopy.card.usernameOrEmail}</Label>
                        <Input
                          id="username"
                          type="text"
                          value={loginData.username}
                          onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder={recruiterAuthPageCopy.card.usernameOrEmailPlaceholder}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-foreground">{recruiterAuthPageCopy.card.password}</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={loginData.password}
                          onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder={recruiterAuthPageCopy.card.passwordPlaceholder}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:opacity-90"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? recruiterAuthPageCopy.card.signingIn : recruiterAuthPageCopy.card.signIn}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName" className="text-foreground">{recruiterAuthPageCopy.card.firstName}</Label>
                          <Input
                            id="firstName"
                            type="text"
                            value={registerData.firstName}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, firstName: e.target.value }))}
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder={recruiterAuthPageCopy.card.firstNamePlaceholder}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName" className="text-foreground">{recruiterAuthPageCopy.card.lastName}</Label>
                          <Input
                            id="lastName"
                            type="text"
                            value={registerData.lastName}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, lastName: e.target.value }))}
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder={recruiterAuthPageCopy.card.lastNamePlaceholder}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="regEmail" className="text-foreground">{recruiterAuthPageCopy.card.email}</Label>
                        <Input
                          id="regEmail"
                          type="email"
                          value={registerData.username}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                          className={`bg-muted/30 border-border text-foreground placeholder:text-muted-foreground ${inviteDetails ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                          placeholder={recruiterAuthPageCopy.card.emailPlaceholder}
                          required
                          readOnly={!!inviteDetails}
                          title={inviteDetails ? "Email is locked to the invite" : undefined}
                        />
                        {inviteDetails && (
                          <p className="text-xs text-muted-foreground">
                            {recruiterAuthPageCopy.invite.emailLocked}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="regPassword" className="text-foreground">{recruiterAuthPageCopy.card.password}</Label>
                        <Input
                          id="regPassword"
                          type="password"
                          autoComplete="new-password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder={recruiterAuthPageCopy.card.createPasswordPlaceholder}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:opacity-90"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? recruiterAuthPageCopy.card.creatingAccount : recruiterAuthPageCopy.card.createRecruiterAccount}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
              </>
              )}
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
