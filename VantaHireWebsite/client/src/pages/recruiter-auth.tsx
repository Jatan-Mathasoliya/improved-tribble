import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Users, TrendingUp, Shield, Mail, CheckCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { OnboardingStatus } from "@/hooks/use-onboarding-status";

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

  const [loginData, setLoginData] = useState({
    username: "",
    password: ""
  });

  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "recruiter"
  });

  // State for email verification flow
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Check onboarding status for recruiters
  const checkOnboardingAndRedirect = useCallback(async () => {
    if (!user || user.role !== "recruiter") return null;

    try {
      const res = await fetch("/api/onboarding-status", { credentials: "include" });
      if (res.ok) {
        const status: OnboardingStatus = await res.json();
        return status;
      }
    } catch {
      // If onboarding status check fails, continue with normal redirect
    }
    return null;
  }, [user]);

  // Redirect if already logged in as recruiter, admin, or hiring manager (shared portal)
  useEffect(() => {
    if (!user) return;

    // If there's an invite token, redirect to org choice to accept the invite
    if (inviteToken && user.role === "recruiter") {
      setLocation(`/org/choice?invite=${inviteToken}`);
      return;
    }

    // If there's a redirect URL and user is recruiter/admin, use it
    if (redirectUrl && (user.role === "recruiter" || user.role === "super_admin")) {
      setLocation(redirectUrl);
      return;
    }

    // For recruiters, check onboarding status before redirecting
    if (user.role === "recruiter") {
      checkOnboardingAndRedirect().then((status) => {
        if (status?.needsOnboarding) {
          setLocation(`/onboarding?step=${status.currentStep}`);
        } else {
          setLocation("/recruiter-dashboard");
        }
      });
      return;
    }

    // Other role redirects
    if (user.role === "super_admin") {
      setLocation("/admin");
    } else if (user.role === "hiring_manager") {
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
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await response.json();
      toast({
        title: "Verification email sent",
        description: data.message || "Please check your inbox.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to send verification email. Please try again.",
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
                Recruiter Portal
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Access powerful tools to manage your job postings, review applications, and find the perfect candidates for your organization.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Briefcase className="h-8 w-8 text-[#7B38FB]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">Job Management</h3>
                  <p className="text-muted-foreground text-sm">Post, edit, and manage your job listings with ease</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-[#FF5BA8]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">Application Review</h3>
                  <p className="text-muted-foreground text-sm">Review, shortlist, and manage candidate applications</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-[#00D2FF]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">Analytics</h3>
                  <p className="text-muted-foreground text-sm">Track job performance and application metrics</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <Shield className="h-8 w-8 text-[#90EE90]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-2">Secure Access</h3>
                  <p className="text-muted-foreground text-sm">Enterprise-grade security for your recruitment data</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-muted-foreground text-sm">
                Looking for candidate access? <Button variant="link" className="text-[#7B38FB] p-0 h-auto" onClick={() => setLocation("/candidate-auth")}>
                  Go to Candidate Login
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
                    <CardTitle className="text-foreground text-2xl">Check Your Email</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      We've sent a verification link to <span className="text-foreground font-medium">{verificationEmail}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm text-center">
                      Click the link in the email to verify your account and start using VantaHire.
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        className="w-full border-border text-foreground hover:bg-muted/50"
                      >
                        {resendLoading ? "Sending..." : "Resend Verification Email"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setRegistrationSuccess(false); setVerificationEmail(""); }}
                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      >
                        Back to Login
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
                    <CardTitle className="text-foreground text-2xl">Verify Your Email</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Please verify your email address before signing in.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm text-center">
                      Check your inbox at <span className="text-foreground font-medium">{verificationEmail}</span> for a verification link.
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        className="w-full border-border text-foreground hover:bg-muted/50"
                      >
                        {resendLoading ? "Sending..." : "Resend Verification Email"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setVerificationNeeded(false); setVerificationEmail(""); }}
                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      >
                        Back to Login
                      </Button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* Normal Auth Form */}
              {!registrationSuccess && !verificationNeeded && (
              <>
              <CardHeader className="text-center">
                <CardTitle className="text-foreground text-2xl">Recruiter Access</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Sign in to your recruiter account or create a new one
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="space-y-6">
                  <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                    <TabsTrigger value="login" className="data-[state=active]:bg-muted/60 text-foreground">
                      Sign In
                    </TabsTrigger>
                    <TabsTrigger value="register" className="data-[state=active]:bg-muted/60 text-foreground">
                      Register
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="text-foreground">Username or Email</Label>
                        <Input
                          id="username"
                          type="text"
                          value={loginData.username}
                          onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="Enter your username or email"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-foreground">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={loginData.password}
                          onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="Enter your password"
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:opacity-90"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign In"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName" className="text-foreground">First Name</Label>
                          <Input
                            id="firstName"
                            type="text"
                            value={registerData.firstName}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, firstName: e.target.value }))}
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder="First name"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
                          <Input
                            id="lastName"
                            type="text"
                            value={registerData.lastName}
                            onChange={(e) => setRegisterData(prev => ({ ...prev, lastName: e.target.value }))}
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder="Last name"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="regEmail" className="text-foreground">Email *</Label>
                        <Input
                          id="regEmail"
                          type="email"
                          value={registerData.username}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="Enter your email address"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="regPassword" className="text-foreground">Password *</Label>
                        <Input
                          id="regPassword"
                          type="password"
                          autoComplete="new-password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="Create a strong password"
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:opacity-90"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating account..." : "Create Recruiter Account"}
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
