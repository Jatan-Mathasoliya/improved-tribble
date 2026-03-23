import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Eye, Briefcase, Plus, Play, Search, Edit, LayoutGrid, CheckCircle, Clock, Archive } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeaderSkeleton, FilterBarSkeleton, JobListSkeleton } from "@/components/skeletons";
import { SubNav, type SubNavItem } from "@/components/SubNav";
import { myJobsPageCopy } from "@/lib/internal-copy";
import type { Job } from "@shared/schema";

type JobWithCounts = Job & {
  company?: string;
  applicationCount?: number;
  hiringManager?: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    username: string;
  };
  clientName?: string | null;
};

export default function MyJobsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch recruiter's jobs
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobWithCounts[]>({
    queryKey: ["/api/my-jobs"],
  });

  // Compute counts for SubNav
  const activeCount = jobs.filter(j => j.isActive).length;
  const inactiveCount = jobs.filter(j => !j.isActive).length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;

  const subNavItems: SubNavItem[] = [
    { id: "all", label: myJobsPageCopy.tabs.all, count: jobs.length, icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "active", label: myJobsPageCopy.tabs.active, count: activeCount, icon: <CheckCircle className="h-4 w-4" /> },
    { id: "inactive", label: myJobsPageCopy.tabs.inactive, count: inactiveCount, icon: <Archive className="h-4 w-4" /> },
    { id: "pending", label: myJobsPageCopy.tabs.pending, count: pendingCount, icon: <Clock className="h-4 w-4" /> },
  ];

  // Publish job mutation
  const publishJobMutation = useMutation({
    mutationFn: async ({ jobId, isActive }: { jobId: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}/status`, { isActive });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({
        title: myJobsPageCopy.toasts.publishSuccessTitle,
        description: myJobsPageCopy.toasts.publishSuccessDescription,
      });
    },
    onError: (error: Error) => {
      toast({
        title: myJobsPageCopy.toasts.publishErrorTitle,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-warning/10 text-warning-foreground border-warning/30';
      case 'approved': return 'bg-success/10 text-success-foreground border-success/30';
      case 'rejected': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Filter jobs based on active tab and search
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());

    // Tab filter takes priority
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "active" && job.isActive) ||
      (activeTab === "inactive" && !job.isActive) ||
      (activeTab === "pending" && job.status === "pending");

    return matchesSearch && matchesTab;
  });

  if (jobsLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6 pt-8">
            <PageHeaderSkeleton />
            <FilterBarSkeleton />
            <JobListSkeleton count={4} />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6 pt-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">{myJobsPageCopy.header.title}</h1>
              <p className="text-muted-foreground text-sm md:text-base">{myJobsPageCopy.header.subtitle}</p>
            </div>
            <Button onClick={() => setLocation("/jobs/post")} data-tour="post-job-button">
              <Plus className="h-4 w-4 mr-2" />
              {myJobsPageCopy.header.primaryAction}
            </Button>
          </div>

          {/* Sub Navigation */}
          <SubNav
            items={subNavItems}
            activeId={activeTab}
            onChange={setActiveTab}
            className="rounded-lg"
          />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={myJobsPageCopy.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Jobs List */}
          <Card className="shadow-sm" data-tour="jobs-list">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">
                {myJobsPageCopy.list.title} ({filteredJobs.length})
              </CardTitle>
              <CardDescription>
                {myJobsPageCopy.list.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredJobs.length === 0 ? (
                  <div className="text-center py-8">
                    {/* Show pending approval message when user has pending jobs but none in current filter */}
                    {pendingCount > 0 && activeTab !== "pending" && !searchQuery ? (
                      <>
                        <Clock className="h-12 w-12 text-warning/50 mx-auto mb-4" />
                        <p className="text-foreground font-medium mb-2">
                          {pendingCount === 1
                            ? myJobsPageCopy.empty.pendingSingle
                            : `${myJobsPageCopy.empty.pendingMultiplePrefix} ${pendingCount} ${myJobsPageCopy.empty.pendingMultipleSuffix}`}
                        </p>
                        <p className="text-muted-foreground text-sm mb-4">
                          {myJobsPageCopy.empty.pendingDescription}
                        </p>
                        <div className="flex gap-3 justify-center">
                          <Button variant="outline" onClick={() => setActiveTab("pending")}>
                            <Clock className="h-4 w-4 mr-2" />
                            {myJobsPageCopy.empty.viewPending}
                          </Button>
                          <Button onClick={() => setLocation("/jobs/post")}>
                            <Plus className="h-4 w-4 mr-2" />
                            {myJobsPageCopy.empty.postAnother}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Briefcase className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground mb-2">
                          {searchQuery || activeTab !== "all"
                            ? myJobsPageCopy.empty.filtered
                            : myJobsPageCopy.empty.none}
                        </p>
                        {!searchQuery && activeTab === "all" && (
                          <Button className="mt-4" onClick={() => setLocation("/jobs/post")}>
                            <Plus className="h-4 w-4 mr-2" />
                            {myJobsPageCopy.empty.firstJob}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-foreground font-medium text-lg">{job.title}</h3>
                          <p className="text-muted-foreground">{job.company} • {job.location}</p>
                          {job.hiringManager && (
                            <p className="text-muted-foreground text-sm mt-1">
                              {myJobsPageCopy.empty.hiringManager}: {job.hiringManager.firstName && job.hiringManager.lastName
                                ? `${job.hiringManager.firstName} ${job.hiringManager.lastName}`
                                : job.hiringManager.username}
                            </p>
                          )}
                          {!job.hiringManager && (
                            <p className="text-muted-foreground text-sm mt-1">{myJobsPageCopy.empty.hiringManager}: —</p>
                          )}
                          <p className="text-muted-foreground text-sm mt-1">{job.type}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                          {job.isActive && (
                            <Badge className="bg-info/10 text-info-foreground border-info/30">
                              Live
                            </Badge>
                          )}
                        </div>
                      </div>

                      <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{job.description}</p>

                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">
                          {job.applicationCount || 0} applications
                        </span>

                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/jobs/${job.id}/applications`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Applications
                          </Button>
                          {job.status === 'approved' && !job.isActive && (
                            <Button
                              size="sm"
                              onClick={() => publishJobMutation.mutate({ jobId: job.id, isActive: true })}
                              disabled={publishJobMutation.isPending}
                              className="bg-success hover:bg-success/80 text-foreground"
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {publishJobMutation.isPending ? 'Publishing...' : 'Publish'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
