import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { User, Building, MapPin, Briefcase, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";

interface PublicRecruiter {
  id: number | string; // publicId if available, otherwise numeric ID
  publicId: string | null;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  bio: string | null;
  location: string | null;
  jobCount: number;
}

export default function RecruitersDirectoryPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { setIsVisible(true); }, []);

  const { data, isLoading } = useQuery<{ recruiters: PublicRecruiter[] }>({
    queryKey: ["/api/recruiters"],
    queryFn: async () => {
      const response = await fetch("/api/recruiters");
      if (!response.ok) throw new Error("Failed to fetch recruiters");
      return response.json();
    },
  });

  const recruiters = data?.recruiters || [];

  const filteredRecruiters = recruiters.filter((recruiter) => {
    const search = searchTerm.toLowerCase();
    return (
      recruiter.displayName.toLowerCase().includes(search) ||
      recruiter.company?.toLowerCase().includes(search) ||
      recruiter.location?.toLowerCase().includes(search)
    );
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Layout>
      <Helmet>
        <title>Recruiters Directory | VantaHire</title>
        <meta name="description" content="Browse our network of specialist recruiters. Find expert recruiters in IT, Telecom, Fintech, Healthcare, and Automotive industries." />
        <link rel="canonical" href="https://www.vantahire.com/recruiters" />
        <meta property="og:title" content="Recruiters Directory | VantaHire" />
        <meta property="og:description" content="Connect with specialist recruiters across industries." />
        <meta property="og:url" content="https://www.vantahire.com/recruiters" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.vantahire.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Recruiters Directory | VantaHire" />
        <meta name="twitter:description" content="Connect with specialist recruiters across industries." />
        <meta name="twitter:image" content="https://www.vantahire.com/twitter-image.jpg" />
      </Helmet>
      <div className="public-theme min-h-screen bg-background text-foreground py-12">
        {/* Premium background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-info/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: "1.2s" }}></div>

        <div className={`container mx-auto px-4 relative z-10 transition-opacity duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-foreground mb-4">Our Recruiters</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Connect with our talented recruitment professionals. Browse their profiles and discover job opportunities.
              </p>
            </div>

            {/* Search */}
            <div className="max-w-md mx-auto mb-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, company, or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted/50 border-border"
                />
              </div>
            </div>

            {/* Results count */}
            {!isLoading && (
              <div className="text-center mb-6">
                <Badge variant="outline" className="text-muted-foreground">
                  {filteredRecruiters.length} {filteredRecruiters.length === 1 ? "recruiter" : "recruiters"} found
                </Badge>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="text-muted-foreground mt-4">Loading recruiters...</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && filteredRecruiters.length === 0 && (
              <div className="text-center py-20">
                <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">No Recruiters Found</h2>
                <p className="text-muted-foreground mb-6">
                  {searchTerm
                    ? "Try adjusting your search terms."
                    : "No recruiters have made their profiles public yet."}
                </p>
                <Link href="/jobs">
                  <Button className="bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8]">
                    Browse Jobs Instead
                  </Button>
                </Link>
              </div>
            )}

            {/* Recruiters Grid */}
            {!isLoading && filteredRecruiters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRecruiters.map((recruiter) => (
                  <Link key={recruiter.id} href={`/recruiters/${recruiter.id}`}>
                    <Card className="bg-muted/50 backdrop-blur-sm border-border hover:bg-muted/70 transition-all cursor-pointer group h-full">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-14 w-14 border-2 border-primary/30 group-hover:border-primary/50 transition-colors">
                            <AvatarImage src={recruiter.photoUrl || undefined} alt={recruiter.displayName} />
                            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-lg">
                              {getInitials(recruiter.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {recruiter.displayName}
                            </h3>
                            {recruiter.company && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                                <Building className="h-3.5 w-3.5 flex-shrink-0" />
                                {recruiter.company}
                              </p>
                            )}
                            {recruiter.location && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                {recruiter.location}
                              </p>
                            )}
                          </div>
                        </div>

                        {recruiter.bio && (
                          <p className="text-sm text-muted-foreground mt-4 line-clamp-2">
                            {recruiter.bio}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                          <Badge variant="outline" className="text-xs">
                            <Briefcase className="h-3 w-3 mr-1" />
                            {recruiter.jobCount} active {recruiter.jobCount === 1 ? "job" : "jobs"}
                          </Badge>
                          <span className="text-xs text-primary group-hover:underline">
                            View Profile
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
