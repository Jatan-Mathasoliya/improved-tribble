import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAIFeatures } from "@/hooks/use-ai-features";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Menu, X, User, LogOut, Briefcase, Plus, ChevronDown, BarChart3, Shield, Sparkles, Settings, Building2, Users, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import QuickAccessBar from "@/components/QuickAccessBar";
import type { User as SelectUser } from "@shared/schema";
import vantahireLogo from "@/assets/vantahire-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { resumeAdvisor, fitScoring } = useAIFeatures();
  const { data: orgData } = useOrganization();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Type guard to help TypeScript narrow the user type
  const isRecruiter = user?.role === 'recruiter';
  const isAdmin = user?.role === 'super_admin';

  // Organization role checks
  const orgRole = orgData?.membership?.role;
  const isOrgOwner = orgRole === 'owner';
  const isOrgAdmin = orgRole === 'admin';
  const isOrgOwnerOrAdmin = isOrgOwner || isOrgAdmin;
  const isCandidate = user?.role === 'candidate';
  const isHiringManager = user?.role === 'hiring_manager';
  const displayName = user?.firstName || user?.username || 'User';
  const aiEnabled = resumeAdvisor || fitScoring;

  // Get role display label
  const getRoleLabel = (role: string | undefined) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'recruiter': return 'Recruiter';
      case 'hiring_manager': return 'Hiring Manager';
      case 'candidate': return 'Candidate';
      default: return null;
    }
  };

  // ATS context detection - determines if we should use light ATS theme
  const atsUser = isRecruiter || isAdmin;

  const isAtsRoute = (path: string): boolean => {
    const atsRoutes = [
      '/recruiter-dashboard',
      '/applications',
      '/my-jobs',
      '/jobs/post',
      '/admin',
      '/analytics',
      '/clients',
      '/profile/settings',
      '/org/settings',
      '/org/team',
      '/org/billing',
      '/org/domain',
      '/org/analytics',
      '/org/choice',
      '/blocked/seat-removed',
    ];

    // Check exact matches first
    if (atsRoutes.some(route => path === route || path.startsWith(route + '/'))) {
      return true;
    }

    // Check for job management route patterns: /jobs/:id/applications, /jobs/:id/edit, /jobs/:id/pipeline, /jobs/:id/analytics
    if (path.match(/^\/jobs\/\d+\/(applications|edit|pipeline|analytics)/)) {
      return true;
    }

    return false;
  };

  const atsContext = atsUser && isAtsRoute(location);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isJobsRoute = location.startsWith('/jobs') || location === '/auth';

  return (
    <div className={cn(
      "min-h-screen bg-background text-foreground",
      atsContext ? "ats-theme" : "public-theme"
    )}>
      {/* Quick Access Bar for authenticated users (not in ATS context) */}
      {user && !atsContext && <QuickAccessBar />}

      {/* ATS Header - Dark theme for recruiter/admin dashboards */}
      {atsContext && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0d0d1a] border-b border-primary/20 shadow-lg">
          <nav className="container mx-auto px-4 py-3 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-xl font-extrabold tracking-wide bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                VantaHire
              </Link>
              <span className="px-2.5 py-1 bg-warning/100 text-foreground text-xs font-bold rounded-md">
                ATS
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {(isRecruiter || isAdmin) && (
                <>
                  <Link
                    href="/recruiter-dashboard"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location === '/recruiter-dashboard'
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/applications"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location === '/applications'
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    Applications
                  </Link>
                  <Link
                    href="/my-jobs"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location === '/my-jobs'
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    My Jobs
                  </Link>
                  <Link
                    href="/admin/forms"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location.startsWith('/admin/forms')
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    Forms
                  </Link>
                  <Link
                    href="/clients"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location.startsWith('/clients')
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    Clients
                  </Link>
                  <Link
                    href="/admin/email-templates"
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      location.startsWith('/admin/email-templates')
                        ? "text-warning bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    Email
                  </Link>
                </>
              )}
            </div>

            {/* User Actions */}
            <div className="flex items-center gap-3">
              {/* Post Job CTA */}
              {(isRecruiter || isAdmin) && (
                <Button
                  onClick={() => setLocation("/jobs/post")}
                  size="sm"
                  variant="gold"
                  className="hidden md:flex"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Post Job
                </Button>
              )}

              {/* Role Badge - visible next to username */}
              {getRoleLabel(user?.role) && (
                <Badge variant="outline" className="text-xs capitalize border-white/30 text-white/70 hidden sm:inline-flex">
                  {getRoleLabel(user?.role)}
                </Badge>
              )}

              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-white/70 hover:text-white hover:bg-white/10">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{displayName}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card">
                  <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    @{user?.username}
                  </div>
                  <div className="px-2 py-1.5 flex items-center gap-2">
                    {getRoleLabel(user?.role) && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {getRoleLabel(user?.role)}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                      v1.8
                    </Badge>
                  </div>
                  <DropdownMenuSeparator />

                  {isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => setLocation("/admin")} className="cursor-pointer">
                        <Shield className="h-4 w-4 mr-2" />
                        Admin Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLocation("/analytics")} className="cursor-pointer">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Job Analytics
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {(user?.role === 'recruiter' || user?.role === 'super_admin') && (
                    <>
                      <DropdownMenuItem onClick={() => setLocation("/profile/settings")} className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" />
                        Profile Settings
                      </DropdownMenuItem>
                      {/* Organization section - only show if user is part of an org and has appropriate role */}
                      {orgData && isOrgOwnerOrAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                            Organization
                          </div>
                          <DropdownMenuItem onClick={() => setLocation("/org/settings")} className="cursor-pointer">
                            <Building2 className="h-4 w-4 mr-2" />
                            Org Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation("/org/team")} className="cursor-pointer">
                            <Users className="h-4 w-4 mr-2" />
                            Team Members
                          </DropdownMenuItem>
                          {/* Billing - only for org owners */}
                          {isOrgOwner && (
                            <DropdownMenuItem onClick={() => setLocation("/org/billing")} className="cursor-pointer">
                              <CreditCard className="h-4 w-4 mr-2" />
                              Billing
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setLocation("/org/analytics")} className="cursor-pointer">
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Analytics
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </nav>
        </header>
      )}

      {/* Header (for public pages or as fallback) */}
      {!user && (
        <header className={`fixed top-0 left-0 right-0 transition-all duration-500 z-50
          ${scrollPosition > 50
            ? 'bg-[#0d0d1a]/95 backdrop-blur-lg shadow-lg py-3 border-b border-primary/20'
            : 'bg-[#0d0d1a]/80 backdrop-blur-sm py-6'}`}
        >
        {/* Premium background glow effects */}
        <div className={`absolute inset-0 -z-10 transition-opacity duration-700 ${scrollPosition > 50 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute left-1/4 w-48 h-12 bg-[#7B38FB]/10 rounded-full blur-[50px] animate-pulse-slow"></div>
          <div className="absolute right-1/4 w-48 h-12 bg-[#2D81FF]/10 rounded-full blur-[50px] animate-pulse-slow" 
               style={{ animationDelay: '1.2s' }}></div>
        </div>
        
        {/* Bottom accent line */}
        <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent
                        transition-opacity duration-500 ${scrollPosition > 50 ? 'opacity-100' : 'opacity-50'}`}>
        </div>
        
        <nav className="container mx-auto px-4 flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <img
              src={vantahireLogo}
              alt="VantaHire"
              className="h-10 w-auto transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-xl font-bold gradient-text-mixed hidden sm:inline">VantaHire</span>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {isJobsRoute ? (
              <>
                <a 
                  href="/jobs" 
                  className={`relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group ${
                    location === "/jobs" ? 'text-white font-medium' : 'text-white/70'
                  }`}
                  onClick={(e) => { e.preventDefault(); setLocation("/jobs"); }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Jobs
                  </span>
                  <span 
                    className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 
                              ${location === "/jobs" ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                  ></span>
                </a>

                {user && (isRecruiter || isAdmin) && (
                  <a
                    href="/jobs/post"
                    className={`relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group ${
                      location === "/jobs/post" ? 'text-white font-medium' : 'text-white/70'
                    }`}
                    onClick={(e) => { e.preventDefault(); setLocation("/jobs/post"); }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Post Job
                    </span>
                    <span
                      className={`absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300
                                ${location === "/jobs/post" ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                    ></span>
                  </a>
                )}
              </>
            ) : (
              <>
                <a 
                  href="/#about" 
                  className="relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group text-white/70"
                  onClick={(e) => {
                    e.preventDefault();
                    if (window.location.pathname === '/') {
                      document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
                    } else {
                      window.location.href = '/#about';
                    }
                  }}
                >
                  <span className="relative z-10">About</span>
                  <span className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></span>
                </a>
                
                <a
                  href="/jobs"
                  className="relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group text-white/70"
                  onClick={(e) => { e.preventDefault(); setLocation("/jobs"); }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Jobs
                  </span>
                  <span className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></span>
                </a>

                <a
                  href="/recruiters"
                  className="relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group text-white/70"
                  onClick={(e) => { e.preventDefault(); setLocation("/recruiters"); }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Browse Recruiters
                  </span>
                  <span className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></span>
                </a>
              </>
            )}


            {/* User Actions */}
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-white/70 text-sm">
                  Welcome, {displayName}
                </span>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <a 
                  href="/candidate-auth" 
                  className="relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group text-white/70"
                  onClick={(e) => { e.preventDefault(); setLocation("/candidate-auth"); }}
                >
                  <span className="relative z-10">Job Seekers</span>
                  <span className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></span>
                </a>
                <a
                  href="/recruiter-auth"
                  className="relative px-3 py-2 hover:text-white transition-all duration-300 overflow-hidden group text-white/70"
                  onClick={(e) => { e.preventDefault(); setLocation("/recruiter-auth"); }}
                >
                  <span className="relative z-10">For Recruiters</span>
                  <span className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] w-full transform origin-left transition-transform duration-300 scale-x-0 group-hover:scale-x-100"></span>
                </a>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              onClick={toggleMenu}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </nav>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 p-6 transition-all duration-500 flex flex-col" style={{ backgroundColor: '#0d0d1a' }}>
            <div className="flex justify-between items-center mb-8">
              <Link
                href="/"
                className="flex items-center gap-2"
                onClick={() => {
                  setIsMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <img
                  src={vantahireLogo}
                  alt="VantaHire"
                  className="h-10 w-auto"
                />
                <span className="text-xl font-bold gradient-text-mixed">VantaHire</span>
              </Link>
              <button
                onClick={toggleMenu}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex flex-col space-y-6">
              {isJobsRoute ? (
                <>
                  <a 
                    href="/jobs" 
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => { e.preventDefault(); setLocation("/jobs"); setIsMenuOpen(false); }}
                  >
                    Jobs
                  </a>
                  {user && (isRecruiter || isAdmin) && (
                    <a 
                      href="/jobs/post" 
                      className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                      onClick={(e) => { e.preventDefault(); setLocation("/jobs/post"); setIsMenuOpen(false); }}
                    >
                      Post Job
                    </a>
                  )}
                </>
              ) : (
                <>
                  <a 
                    href="/#about" 
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMenuOpen(false);
                      if (window.location.pathname === '/') {
                        document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
                      } else {
                        window.location.href = '/#about';
                      }
                    }}
                  >
                    About
                  </a>
                  <a
                    href="/jobs"
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => { e.preventDefault(); setLocation("/jobs"); setIsMenuOpen(false); }}
                  >
                    Jobs
                  </a>
                  <a
                    href="/recruiters"
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => { e.preventDefault(); setLocation("/recruiters"); setIsMenuOpen(false); }}
                  >
                    Browse Recruiters
                  </a>
                </>
              )}
              

              {user ? (
                <Button
                  onClick={() => { handleLogout(); setIsMenuOpen(false); }}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                >
                  Logout
                </Button>
              ) : (
                <div className="space-y-6">
                  <a 
                    href="/candidate-auth" 
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => { e.preventDefault(); setLocation("/candidate-auth"); setIsMenuOpen(false); }}
                  >
                    Job Seekers
                  </a>
                  <a
                    href="/recruiter-auth"
                    className="text-xl relative px-2 py-1 text-white transition-all duration-300 border-l-2 pl-4 border-transparent hover:border-[#7B38FB]"
                    onClick={(e) => { e.preventDefault(); setLocation("/recruiter-auth"); setIsMenuOpen(false); }}
                  >
                    For Recruiters
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      )}

      {/* Main Content */}
      <main className={user ? "pt-20" : "pt-20"}>
        {children}
      </main>

      {/* Footer */}
      <Footer minimal={atsContext} />
    </div>
  );
};

export default Layout;
