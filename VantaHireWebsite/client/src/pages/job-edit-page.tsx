import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { ArrowLeft, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Client, Job } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import { JobSubNav } from "@/components/JobSubNav";
import { PageHeaderSkeleton } from "@/components/skeletons";
import { CoRecruiterManagement } from "@/components/CoRecruiterManagement";

const MIN_DESCRIPTION_WORDS = 200;
const countWords = (value: string): number =>
  value
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

export default function JobEditPage() {
  const [match, params] = useRoute("/jobs/:id/edit");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    type: "full-time",
    skills: [] as string[],
  });
  const [hiringManagerId, setHiringManagerId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const descriptionWordCount = countWords(formData.description);
  const descriptionWordsRemaining = Math.max(0, MIN_DESCRIPTION_WORDS - descriptionWordCount);

  const jobId = params?.id ? parseInt(params.id) : null;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Redirect if not recruiter or admin
  if (!user || !['recruiter', 'super_admin'].includes(user.role)) {
    return <Redirect to="/auth" />;
  }

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) throw new Error("Failed to fetch job");
      return response.json();
    },
    enabled: !!jobId,
  });

  const { data: hiringManagers = [] } = useQuery<
    Array<{ id: number; username: string; firstName: string | null; lastName: string | null }>
  >({
    queryKey: ["/api/users", { role: "hiring_manager" }],
    queryFn: async () => {
      const response = await fetch("/api/users?role=hiring_manager", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch hiring managers");
      return response.json();
    },
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
  });

  // Populate form when job loads
  useEffect(() => {
    if (job) {
      setFormData({
        title: job.title,
        description: job.description,
        location: job.location,
        type: job.type,
        skills: job.skills || [],
      });
      setHiringManagerId(job.hiringManagerId ? String(job.hiringManagerId) : "");
      setClientId(job.clientId ? String(job.clientId) : "");
    }
  }, [job]);

  const updateJobMutation = useMutation({
    mutationFn: async (data: Partial<Job>) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({
        title: "Job updated",
        description: "Job details have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateJobMutation.mutate({
      ...formData,
      hiringManagerId: hiringManagerId ? Number(hiringManagerId) : null,
      clientId: clientId ? Number(clientId) : null,
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6 pt-8">
            <PageHeaderSkeleton />
          </div>
        </div>
      </Layout>
    );
  }

  if (!job) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">Job Not Found</h3>
              <p className="text-muted-foreground">The requested job could not be found.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`container mx-auto px-4 py-8 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="flex items-center gap-3 pt-8 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/jobs/${jobId}/applications`)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Job
            </Button>
          </div>

          {/* Job-Level Sub Navigation */}
          <JobSubNav jobId={jobId!} jobTitle={job.title} className="mb-6" />

          {/* Edit Form */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-foreground">Edit Job Details</CardTitle>
              <CardDescription>Update the job posting information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Job Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Job Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData((prev) => {
                        const nextType = value as typeof prev.type;
                        let nextLocation = prev.location;
                        if (nextType === "remote" && !nextLocation.trim()) {
                          nextLocation = "Remote";
                        } else if (prev.type === "remote" && nextType !== "remote" && nextLocation.trim().toLowerCase() === "remote") {
                          nextLocation = "";
                        }
                        return { ...prev, type: nextType, location: nextLocation };
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full Time</SelectItem>
                      <SelectItem value="part-time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={8}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    {descriptionWordCount}/{MIN_DESCRIPTION_WORDS} words
                  </p>
                  {/* SEO warning for short descriptions */}
                  {descriptionWordCount > 0 && descriptionWordCount < MIN_DESCRIPTION_WORDS && (
                    <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-amber-800">
                        <strong>SEO tip:</strong> Descriptions under {MIN_DESCRIPTION_WORDS} words may not appear in Google Jobs.
                        {descriptionWordsRemaining > 0 && ` Add ${descriptionWordsRemaining} more words for better visibility.`}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills">Skills (comma-separated)</Label>
                  <Input
                    id="skills"
                    value={formData.skills.join(", ")}
                    onChange={(e) => setFormData({
                      ...formData,
                      skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                    })}
                    placeholder="React, TypeScript, Node.js"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hiringManager">Hiring Manager (Optional)</Label>
                    <Select
                      value={hiringManagerId || "__none__"}
                      onValueChange={(val) => setHiringManagerId(val === "__none__" ? "" : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a hiring manager..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {hiringManagers.map((hm) => (
                          <SelectItem key={hm.id} value={hm.id.toString()}>
                            {hm.firstName && hm.lastName
                              ? `${hm.firstName} ${hm.lastName} (${hm.username})`
                              : hm.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="client">Client (Optional)</Label>
                    <Select
                      value={clientId || "__none__"}
                      onValueChange={(val) => setClientId(val === "__none__" ? "" : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Internal role / no client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Internal / No client</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.name}
                            {client.domain ? ` (${client.domain})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateJobMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {updateJobMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Co-Recruiter Management */}
          <CoRecruiterManagement jobId={jobId!} className="shadow-sm" />
        </div>
      </div>
    </Layout>
  );
}
