import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, LogIn, Briefcase, Users, ArrowLeft, Mail } from "lucide-react";
import Layout from "@/components/Layout";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "recruiter"
  });
  const [isVisible, setIsVisible] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) return;

    setIsSendingReset(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });
      const data = await res.json();
      toast({
        title: "Check your email",
        description: data.message || "If an account exists with this email, a password reset link has been sent.",
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to send password reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  // Redirect if already logged in based on role
  if (user) {
    if (user.role === 'recruiter') {
      return <Redirect to="/recruiter-dashboard" />;
    } else if (user.role === 'super_admin') {
      return <Redirect to="/admin" />;
    } else if (user.role === 'hiring_manager') {
      return <Redirect to="/hiring-manager" />;
    } else if (user.role === 'candidate') {
      return <Redirect to="/jobs" />;
    }
    return <Redirect to="/jobs" />;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerData);
  };

  return (
    <Layout>
      <div className="public-theme min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
        {/* Premium background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-info/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>

        {/* Left Side - Auth Forms */}
        <div className={`flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative z-10 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-full max-w-md">
            <div className="text-center mb-8 animate-fade-in">
              <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mx-auto mb-6"></div>
              <h1 className="text-3xl md:text-4xl font-bold animate-gradient-text mb-2">VantaHire</h1>
              <p className="text-muted-foreground text-lg">Join our AI-powered recruitment platform</p>
            </div>

            <Tabs defaultValue="login" className="w-full animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 backdrop-blur-sm border border-border">
                <TabsTrigger value="login" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#7B38FB] data-[state=active]:to-[#FF5BA8] text-foreground data-[state=active]:text-foreground transition-all duration-300">
                Login
              </TabsTrigger>
              <TabsTrigger value="register" className="data-[state=active]:bg-muted/60 text-foreground">
                Register
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="bg-muted/50 backdrop-blur-sm border-border">
                {showForgotPassword ? (
                  <>
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Reset Password
                      </CardTitle>
                      <CardDescription className="text-muted-foreground/50">
                        Enter your email to receive a password reset link
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <Label htmlFor="forgot-email" className="text-foreground">Email</Label>
                          <Input
                            id="forgot-email"
                            type="email"
                            value={forgotPasswordEmail}
                            onChange={(e) => setForgotPasswordEmail(e.target.value)}
                            required
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder="Enter your email"
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={isSendingReset}
                          className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                        >
                          {isSendingReset ? "Sending..." : "Send Reset Link"}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowForgotPassword(false)}
                          className="w-full text-muted-foreground hover:text-foreground"
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Login
                        </Button>
                      </form>
                    </CardContent>
                  </>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <LogIn className="h-5 w-5" />
                        Welcome Back
                      </CardTitle>
                      <CardDescription className="text-muted-foreground/50">
                        Sign in with your email address
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                          <Label htmlFor="login-username" className="text-foreground">Email</Label>
                          <Input
                            id="login-username"
                            type="text"
                            value={loginData.username}
                            onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                            required
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder="Enter your username or email"
                          />
                        </div>

                        <div>
                          <Label htmlFor="login-password" className="text-foreground">Password</Label>
                          <Input
                            id="login-password"
                            type="password"
                            autoComplete="current-password"
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            required
                            className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                            placeholder="Enter your password"
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={loginMutation.isPending}
                          className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                        >
                          {loginMutation.isPending ? "Signing in..." : "Sign In"}
                        </Button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Forgot your password?
                          </button>
                        </div>
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="bg-muted/50 backdrop-blur-sm border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Create Account
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/50">
                    Join VantaHire as a recruiter
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName" className="text-foreground">First Name</Label>
                        <Input
                          id="firstName"
                          type="text"
                          value={registerData.firstName}
                          onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
                        <Input
                          id="lastName"
                          type="text"
                          value={registerData.lastName}
                          onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })}
                          className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="register-username" className="text-foreground">Email *</Label>
                      <Input
                        id="register-username"
                        type="email"
                        value={registerData.username}
                        onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                        required
                        className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                        placeholder="Enter your email address"
                      />
                    </div>

                    <div>
                      <Label htmlFor="register-password" className="text-foreground">Password *</Label>
                      <Input
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                        required
                        className="bg-muted/30 border-border text-foreground placeholder:text-muted-foreground"
                        placeholder="Create a strong password"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={registerMutation.isPending}
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Side - Hero Section */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-8 bg-gradient-to-br from-purple-600/20 to-blue-600/20">
        <div className="text-center max-w-lg">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full mb-6">
              <Briefcase className="h-12 w-12 text-foreground" />
            </div>
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Power Your Recruitment
            </h2>
            <p className="text-xl text-muted-foreground/50 mb-8">
              Join VantaHire's AI-powered platform to find the best talent and streamline your hiring process.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="flex items-center gap-4 text-left">
              <div className="flex-shrink-0 w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">Smart Matching</h3>
                <p className="text-muted-foreground/50 text-sm">AI-powered candidate matching for better hiring decisions</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-left">
              <div className="flex-shrink-0 w-12 h-12 bg-info/20 rounded-lg flex items-center justify-center">
                <Briefcase className="h-6 w-6 text-info" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">Job Management</h3>
                <p className="text-muted-foreground/50 text-sm">Post jobs, track applications, and manage candidates efficiently</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-left">
              <div className="flex-shrink-0 w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <LogIn className="h-6 w-6 text-pink-300" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold mb-1">Seamless Experience</h3>
                <p className="text-muted-foreground/50 text-sm">Intuitive platform designed for modern recruitment teams</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}
