import { useState, useEffect, useMemo } from "react";
import { useRoute, Link, useSearch } from "wouter";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Layout from "@/components/Layout";

type VerificationState = "ready" | "loading" | "success" | "error" | "expired";

export default function VerifyEmailPage() {
  const [, params] = useRoute("/verify-email/:token");
  const searchString = useSearch();
  const [state, setState] = useState<VerificationState>("ready");
  const [message, setMessage] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  const token = params?.token;

  // Parse invite token from URL query params to preserve through verification
  const inviteToken = useMemo(() => {
    const searchParams = new URLSearchParams(searchString);
    return searchParams.get('invite');
  }, [searchString]);

  // Build redirect URL with invite token if present
  const redirectUrl = inviteToken
    ? `/recruiter-auth?invite=${inviteToken}`
    : '/recruiter-auth';

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Validate token format on load. Actual verification is user-initiated
  // so email security bots that prefetch links don't consume tokens.
  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Invalid verification link.");
    }
  }, [token]);

  const verifyEmail = async () => {
    if (!token || state === "loading") return;
    setState("loading");
    setMessage("");

    try {
      const response = await fetch(`/api/verify-email/${token}`);
      const data = await response.json();

      if (response.ok && data.verified) {
        setState("success");
        setMessage(data.message || "Your email has been verified successfully!");
      } else if (data.code === "VERIFICATION_TOKEN_EXPIRED") {
        setState("expired");
        setMessage(data.error || "Your verification link has expired.");
      } else if (data.code === "VERIFICATION_TOKEN_INVALID") {
        setState("error");
        setMessage(data.error || "This verification link is invalid or already used.");
      } else if (typeof data.error === "string" && data.error.toLowerCase().includes("expired")) {
        setState("expired");
        setMessage(data.error || "Your verification link has expired.");
      } else {
        setState("error");
        setMessage(data.error || "Failed to verify your email.");
      }
    } catch {
      setState("error");
      setMessage("An error occurred while verifying your email.");
    }
  };

  return (
    <Layout>
      <div className="public-theme min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        {/* Premium background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-info/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>

        <div className={`w-full max-w-md relative z-10 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <Card className="bg-muted/50 backdrop-blur-sm border-border">
            <CardHeader className="text-center">
              {state === "ready" && (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
                      <Mail className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-foreground text-2xl">Confirm Email Verification</CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    Click the button below to verify your email address.
                  </CardDescription>
                </>
              )}

              {state === "loading" && (
                <>
                  <div className="flex justify-center mb-4">
                    <Loader2 className="h-16 w-16 text-primary animate-spin" />
                  </div>
                  <CardTitle className="text-foreground text-2xl">Verifying your email...</CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    Please wait while we verify your email address.
                  </CardDescription>
                </>
              )}

              {state === "success" && (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-12 w-12 text-success" />
                    </div>
                  </div>
                  <CardTitle className="text-foreground text-2xl">Email Verified!</CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    {message}
                  </CardDescription>
                </>
              )}

              {state === "error" && (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center">
                      <XCircle className="h-12 w-12 text-destructive" />
                    </div>
                  </div>
                  <CardTitle className="text-foreground text-2xl">Verification Failed</CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    {message}
                  </CardDescription>
                </>
              )}

              {state === "expired" && (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 bg-warning/20 rounded-full flex items-center justify-center">
                      <Mail className="h-12 w-12 text-warning" />
                    </div>
                  </div>
                  <CardTitle className="text-foreground text-2xl">Link Expired</CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    {message}
                  </CardDescription>
                </>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {state === "ready" && (
                <Button
                  onClick={verifyEmail}
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                >
                  Verify Email
                </Button>
              )}

              {state === "success" && (
                <Link href={redirectUrl}>
                  <Button className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                    Continue to Login
                  </Button>
                </Link>
              )}

              {state === "expired" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Please log in with your credentials to request a new verification email.
                  </p>
                  <Link href={redirectUrl}>
                    <Button className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                      Go to Login
                    </Button>
                  </Link>
                </div>
              )}

              {state === "error" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    The verification link may be invalid or already used.
                  </p>
                  <Link href={redirectUrl}>
                    <Button className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600">
                      Go to Login
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
