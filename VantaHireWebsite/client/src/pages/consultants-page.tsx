import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Linkedin, MapPin, Briefcase } from "lucide-react";
import Layout from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import type { Consultant } from "@shared/schema";

export default function ConsultantsPage() {
  const { data: consultants = [], isLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/consultants"],
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <div className="text-center text-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Our Consultants | VantaHire</title>
        <meta name="description" content="Meet our network of specialist consultants and recruiters with expertise across IT, Telecom, Fintech, Healthcare, and Automotive." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="public-theme min-h-screen bg-background text-foreground">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-10"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.2s' }}></div>

        <div className="container mx-auto px-4 py-16 relative z-10">
          {/* Header */}
          <div className="text-center mb-12 pt-8">
            <div className="w-20 h-1.5 bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] rounded-full mx-auto mb-6 animate-slide-right"></div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="animate-gradient-text">Our</span>
              <span className="text-foreground ml-3">Consultants</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Meet our experienced recruitment specialists ready to help you find the perfect talent
            </p>
          </div>

          {/* Consultants Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {consultants.map((consultant) => (
              <Card key={consultant.id} className="bg-muted/50 backdrop-blur-sm border-border hover:bg-muted/40 transition-all duration-300 hover:scale-105">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    {consultant.photoUrl && (
                      <img
                        src={consultant.photoUrl}
                        alt={consultant.name}
                        className="w-20 h-20 rounded-full object-cover border-2 border-[#7B38FB]"
                        onError={(e) => {
                          // Fallback to initials if image fails to load
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-foreground text-xl mb-1">{consultant.name}</CardTitle>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                        <Briefcase className="h-4 w-4" />
                        <span>{consultant.experience}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Domains */}
                  <div>
                    <p className="text-foreground text-sm font-semibold mb-2">Expertise:</p>
                    <div className="flex flex-wrap gap-2">
                      {consultant.domains.split(',').slice(0, 3).map((domain, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="bg-primary/20 text-primary border-primary/30 text-xs"
                        >
                          {domain.trim()}
                        </Badge>
                      ))}
                      {consultant.domains.split(',').length > 3 && (
                        <Badge
                          variant="secondary"
                          className="bg-primary/20 text-primary border-primary/30 text-xs"
                        >
                          +{consultant.domains.split(',').length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {consultant.description && (
                    <p className="text-muted-foreground text-sm line-clamp-3">{consultant.description}</p>
                  )}

                  {/* LinkedIn Link */}
                  {consultant.linkedinUrl && (
                    <a
                      href={consultant.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border text-foreground hover:bg-muted/50 w-full"
                      >
                        <Linkedin className="h-4 w-4 mr-2" />
                        View LinkedIn Profile
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {consultants.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">No consultants available at the moment.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
