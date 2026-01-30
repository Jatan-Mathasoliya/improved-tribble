import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  MapPin,
  Clock,
  Calendar,
  Users,
  FileText,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  UserCheck,
  MessageSquare,
  Filter,
  Search,
  Briefcase,
  Target,
  Mail,
  Star,
  History,
  ArrowLeft,
  FileDown,
  Plus,
  ArrowUpDown,
  Sparkles,
  X,
  Info,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Job, Application, PipelineStage, EmailTemplate } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formsApi, formsQueryKeys, type FormTemplateDTO, type InvitationQuotaResponse } from "@/lib/formsApi";
import Layout from "@/components/Layout";
import { CandidateIntakeForm } from "@/components/candidate-intake";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { FormsModal } from "@/components/FormsModal";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { ApplicationDetailModal } from "@/components/kanban/ApplicationDetailModal";
import { PageHeaderSkeleton, FilterBarSkeleton, KanbanBoardSkeleton } from "@/components/skeletons";
import { JobSubNav } from "@/components/JobSubNav";

export default function ApplicationManagementPage() {
  const [match, params] = useRoute("/jobs/:id/applications");
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [selectedApplications, setSelectedApplications] = useState<number[]>([]);
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [sortBy, setSortBy] = useState<'date' | 'ai_fit'>('date'); // AI Fit Sorting
  const [actionFilter, setActionFilter] = useState<string[]>([]); // AI Suggested Action Filter
  const [isVisible, setIsVisible] = useState(false);

  // ATS features state
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [selectedAppResumeText, setSelectedAppResumeText] = useState<string | null>(null);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewLocation, setInterviewLocation] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [newRecruiterNote, setNewRecruiterNote] = useState("");
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);
  const [addCandidateModalOpen, setAddCandidateModalOpen] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showBulkEmailDialog, setShowBulkEmailDialog] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; total: number }>({ sent: 0, total: 0 });
  const [showBulkFormsDialog, setShowBulkFormsDialog] = useState(false);
  const [bulkFormId, setBulkFormId] = useState<number | null>(null);
  const [bulkFormMessage, setBulkFormMessage] = useState("");
  const [bulkFormsProgress, setBulkFormsProgress] = useState<{ sent: number; total: number }>({ sent: 0, total: 0 });
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showFormsDialog, setShowFormsDialog] = useState(false);
  const [showBatchInterviewDialog, setShowBatchInterviewDialog] = useState(false);
  const [batchInterviewDate, setBatchInterviewDate] = useState("");
  const [batchInterviewTime, setBatchInterviewTime] = useState("");
  const [batchIntervalHours, setBatchIntervalHours] = useState("0");
  const [batchLocation, setBatchLocation] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchStageId, setBatchStageId] = useState<string>("");
  const [showShareShortlistDialog, setShowShareShortlistDialog] = useState(false);
  const [shortlistTitle, setShortlistTitle] = useState("");
  const [shortlistMessage, setShortlistMessage] = useState("");
  const [shortlistExpiresAt, setShortlistExpiresAt] = useState("");
  const [shortlistUrl, setShortlistUrl] = useState<string | null>(null);

  // AI Summary state
  const [showAISummaryDialog, setShowAISummaryDialog] = useState(false);
  const [aiSummaryJobId, setAiSummaryJobId] = useState<number | null>(null);
  const [regenerateSummaries, setRegenerateSummaries] = useState(false);

  type JobShortlistSummary = {
    id: number;
    title: string | null;
    message: string | null;
    createdAt: string;
    expiresAt: string | null;
    status: string;
    client: { id: number; name: string } | null;
    candidateCount: number;
    publicUrl: string;
    fullUrl: string;
  };

  const jobId = params?.id ? parseInt(params.id) : null;

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Read stage filter from URL on mount and when URL changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stageParam = params.get("stage");
    if (stageParam) {
      setStageFilter(stageParam);
    }
  }, [location]);

  // Redirect if not recruiter or admin
  if (!user || !['recruiter', 'super_admin'].includes(user.role)) {
    return <Redirect to="/auth" />;
  }

  const { data: job, isLoading: jobLoading, error: jobError } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch job (${response.status})`);
      }
      return response.json();
    },
    enabled: !!jobId,
  });

  const { data: rawShortlists } = useQuery<JobShortlistSummary[]>({
    queryKey: ["/api/jobs", jobId, "client-shortlists"],
    queryFn: async () => {
      if (!jobId) return [];
      const response = await fetch(`/api/jobs/${jobId}/client-shortlists`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch client shortlists");
      return response.json();
    },
    enabled: !!jobId && !!job?.clientId,
  });
  const shortlists: JobShortlistSummary[] = Array.isArray(rawShortlists) ? rawShortlists : [];

  const { data: applications, isLoading: applicationsLoading } = useQuery<Application[]>({
    queryKey: ["/api/jobs", jobId, "applications"],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}/applications`);
      if (!response.ok) throw new Error("Failed to fetch applications");
      return response.json();
    },
    enabled: !!jobId,
  });

  // ATS: Fetch pipeline stages
  const { data: pipelineStages = [] } = useQuery<PipelineStage[]>({
    queryKey: ["/api/pipeline/stages"],
    queryFn: async () => {
      const response = await fetch("/api/pipeline/stages");
      if (!response.ok) throw new Error("Failed to fetch pipeline stages");
      return response.json();
    },
  });

  // ATS: Fetch email templates
  const { data: emailTemplates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: async () => {
      const response = await fetch("/api/email-templates");
      if (!response.ok) throw new Error("Failed to fetch email templates");
      return response.json();
    },
  });

  // ATS: Fetch form templates
  const { data: formTemplates = [] } = useQuery<FormTemplateDTO[]>({
    queryKey: ["/api/forms/templates"],
    queryFn: async () => {
      const result = await formsApi.listTemplates();
      return result.templates;
    },
  });

  // ATS: Fetch form invitation quota (remaining daily invites)
  const { data: invitationQuota } = useQuery<InvitationQuotaResponse>({
    queryKey: formsQueryKeys.invitationQuota(),
    queryFn: () => formsApi.getInvitationQuota(),
    enabled: showBulkFormsDialog || showFormsDialog,
    staleTime: 30_000, // Cache for 30 seconds
  });

  // ATS: Fetch stage history for selected application
  const { data: stageHistory = [] } = useQuery({
    queryKey: ["/api/applications", selectedApp?.id, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/applications/${selectedApp?.id}/history`);
      if (!response.ok) throw new Error("Failed to fetch stage history");
      return response.json();
    },
    enabled: !!selectedApp?.id && showHistoryDialog,
  });

  // AI Summary: Rate limit status query
  interface SummaryLimitStatus {
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
    dailyResetAt: string;
    budgetAllowed: boolean;
    budgetSpent: number;
    budgetLimit: number;
    effectiveRemaining: number;
    maxBatchSize: number;
  }

  const { data: summaryLimitStatus } = useQuery<SummaryLimitStatus>({
    queryKey: ['/api/ai/summary/limit-status'],
    queryFn: async () => {
      const response = await fetch('/api/ai/summary/limit-status', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch limit status');
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // AI Summary: Job status polling
  interface SummaryJobStatus {
    id: number;
    status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    processedCount: number;
    totalCount: number;
    result?: {
      results: Array<{ applicationId: number; status: string; error?: string }>;
      summary: { total: number; succeeded: number; skipped: number; errors: number };
    };
    error?: string;
  }

  const { data: summaryJobStatus } = useQuery<SummaryJobStatus>({
    queryKey: ['/api/ai/summary/jobs', aiSummaryJobId],
    queryFn: async () => {
      const response = await fetch(`/api/ai/summary/jobs/${aiSummaryJobId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch job status');
      return response.json();
    },
    enabled: !!aiSummaryJobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'completed' || data?.status === 'failed' || data?.status === 'cancelled' ? false : 2000;
    },
  });

  // AI Summary: Start mutation
  const startAISummaryMutation = useMutation({
    mutationFn: async ({ applicationIds, regenerate }: { applicationIds: number[]; regenerate: boolean }) => {
      const res = await apiRequest('POST', '/api/applications/bulk/ai-summary/queue', { applicationIds, regenerate });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.cached) {
        toast({ title: 'All Selected Have Summaries', description: data.message });
        setShowAISummaryDialog(false);
      } else {
        setAiSummaryJobId(data.jobId);
        toast({ title: 'AI Summary Started', description: `Processing ${data.totalCount} candidates...` });
      }
    },
    onError: (error: any) => {
      const errorData = error.response?.data || {};
      let msg = errorData.error || error.message || 'Failed to start AI summary generation';

      // Handle specific error codes with clear messaging
      if (errorData.errorCode === 'MAX_EXCEEDED') {
        msg = `Please select 50 or fewer candidates.`;
      } else if (errorData.errorCode === 'RATE_LIMIT_EXCEEDED') {
        msg = `You have only ${errorData.remaining} analyses left today. Select fewer candidates.`;
      } else if (errorData.errorCode === 'PENDING_LIMIT') {
        msg = 'You have a job in progress. Please wait for it to complete.';
      }

      toast({ title: 'Cannot Generate Summaries', description: msg, variant: 'destructive' });
    },
  });

  // AI Summary: Handle job completion effect
  useEffect(() => {
    if (summaryJobStatus?.status === 'completed') {
      const result = summaryJobStatus.result?.summary || { succeeded: 0, skipped: 0, errors: 0 };
      toast({
        title: 'AI Summaries Generated',
        description: `${result.succeeded} generated, ${result.skipped} skipped, ${result.errors} failed.`,
      });
      setShowAISummaryDialog(false);
      setAiSummaryJobId(null);
      setRegenerateSummaries(false);
      // Refresh applications to show new summaries
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'applications'] });
      // Refresh limit status
      queryClient.invalidateQueries({ queryKey: ['/api/ai/summary/limit-status'] });
    }

    if (summaryJobStatus?.status === 'failed') {
      toast({
        title: 'Summary Generation Failed',
        description: summaryJobStatus.error || 'An error occurred during processing',
        variant: 'destructive',
      });
      setAiSummaryJobId(null);
    }
  }, [summaryJobStatus?.status, summaryJobStatus?.result, summaryJobStatus?.error, jobId, toast]);

  // ATS: Auto-select an Interview stage in the batch interview dialog (if available)
  useEffect(() => {
    if (!showBatchInterviewDialog || batchStageId || pipelineStages.length === 0) {
      return;
    }

    // Prefer the earliest "Interview" stage by order if multiple exist
    const sortedStages = [...pipelineStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const interviewStage = sortedStages.find((stage) =>
      stage.name.toLowerCase().includes("interview")
    );

    if (interviewStage) {
      setBatchStageId(interviewStage.id.toString());
    }
  }, [showBatchInterviewDialog, batchStageId, pipelineStages]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ applicationId, status, notes }: { applicationId: number; status: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/status`, {
        status,
        notes
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      toast({
        title: "Status updated",
        description: "Application status has been updated successfully.",
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

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ applicationIds, status, notes }: { applicationIds: number[]; status: string; notes?: string }) => {
      const res = await apiRequest("PATCH", "/api/applications/bulk", {
        applicationIds,
        status,
        notes
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      setSelectedApplications([]);
      toast({
        title: "Bulk update successful",
        description: `${data.updatedCount} applications updated successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markViewedMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/view`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
    },
  });

  const markDownloadedMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/download`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      toast({
        title: "Download tracked",
        description: "Resume download has been recorded.",
      });
    },
  });

  // ATS: Update application stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ applicationId, stageId, notes }: { applicationId: number; stageId: number; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/stage`, {
        stageId,
        notes,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      toast({
        title: "Stage updated",
        description: "Application moved to new stage successfully.",
      });
    },
  });

  // ATS: Schedule interview mutation
  const scheduleInterviewMutation = useMutation({
    mutationFn: async ({ applicationId, date, time, location, notes }: {
      applicationId: number;
      date: string;
      time: string;
      location: string;
      notes?: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/interview`, {
        date,
        time,
        location,
        notes,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      setShowInterviewDialog(false);
      setInterviewDate("");
      setInterviewTime("");
      setInterviewLocation("");
      setInterviewNotes("");
      toast({
        title: "Interview scheduled",
        description: "Interview has been scheduled successfully.",
      });
    },
  });

  const createShortlistMutation = useMutation({
    mutationFn: async () => {
      if (!jobId || !job?.clientId || selectedApplications.length === 0) {
        throw new Error("Missing job, client, or applications");
      }
      const payload: {
        clientId: number;
        jobId: number;
        title?: string;
        message?: string;
        applicationIds: number[];
        expiresAt?: string;
      } = {
        clientId: job.clientId,
        jobId,
        applicationIds: selectedApplications,
      };
      if (shortlistTitle.trim()) payload.title = shortlistTitle.trim();
      if (shortlistMessage.trim()) payload.message = shortlistMessage.trim();
      if (shortlistExpiresAt) payload.expiresAt = new Date(shortlistExpiresAt).toISOString();

      const res = await apiRequest("POST", "/api/client-shortlists", payload);
      return await res.json();
    },
    onSuccess: (data: { publicUrl?: string; fullUrl?: string }) => {
      const url = data.fullUrl || data.publicUrl || "";
      setShortlistUrl(url || null);
      toast({
        title: "Shortlist Created",
        description: "Share this link with your client to review candidates.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Shortlist",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ATS: Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async ({ applicationId, templateId }: { applicationId: number; templateId: number }) => {
      const res = await apiRequest("POST", `/api/applications/${applicationId}/send-email`, {
        templateId,
      });
      return await res.json();
    },
    onSuccess: () => {
      setShowEmailDialog(false);
      setSelectedTemplateId(null);
      toast({
        title: "Email sent",
        description: "Email has been sent successfully.",
      });
    },
  });

  // ATS: Send bulk emails mutation
  const sendBulkEmailsMutation = useMutation({
    mutationFn: async ({ applicationIds, templateId }: { applicationIds: number[]; templateId: number }) => {
      let success = 0;
      let failed = 0;
      setBulkProgress({ sent: 0, total: applicationIds.length });
      for (const id of applicationIds) {
        try {
          const res = await apiRequest("POST", `/api/applications/${id}/send-email`, { templateId });
          await res.json();
          success++;
        } catch (_) {
          failed++;
        } finally {
          setBulkProgress((p) => ({ sent: Math.min(p.sent + 1, applicationIds.length), total: applicationIds.length }));
        }
      }
      return { summary: { total: applicationIds.length, success, failed } };
    },
    onSuccess: ({ summary }) => {
      setShowBulkEmailDialog(false);
      setBulkTemplateId(null);
      setSelectedApplications([]);
      setBulkProgress({ sent: 0, total: 0 });
      toast({
        title: "Bulk email sent",
        description: `Sent: ${summary.success}, Failed: ${summary.failed}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk email failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ATS: Send bulk forms mutation (client fan-out)
  const sendBulkFormsMutation = useMutation({
    mutationFn: async ({ applicationIds, formId, customMessage }: { applicationIds: number[]; formId: number; customMessage?: string }) => {
      let created = 0;
      let duplicate = 0;
      let unauthorized = 0;
      let failed = 0;
      setBulkFormsProgress({ sent: 0, total: applicationIds.length });

      for (const appId of applicationIds) {
        try {
          await formsApi.createInvitation({
            applicationId: appId,
            formId,
            ...(customMessage && { customMessage })
          });
          created++;
        } catch (err: any) {
          // Categorize errors by status code
          if (err.status === 409 || (err.message && err.message.includes('already been sent'))) {
            duplicate++;
          } else if (err.status === 403 || (err.message && err.message.includes('Unauthorized'))) {
            unauthorized++;
          } else {
            failed++;
          }
        } finally {
          setBulkFormsProgress(p => ({
            sent: Math.min(p.sent + 1, applicationIds.length),
            total: applicationIds.length
          }));
        }
      }

      return { summary: { total: applicationIds.length, created, duplicate, unauthorized, failed } };
    },
    onSuccess: ({ summary }) => {
      setShowBulkFormsDialog(false);
      setBulkFormId(null);
      setBulkFormMessage("");
      setSelectedApplications([]);
      setBulkFormsProgress({ sent: 0, total: 0 });
      // Invalidate invitation quota to refresh remaining count
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.invitationQuota() });
      toast({
        title: "Bulk forms sent",
        description: `Created: ${summary.created}, Duplicates: ${summary.duplicate}, Failed: ${summary.failed}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk forms failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ATS: Batch interview scheduling mutation
  const batchInterviewMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("Invalid job id");
      const interval = parseFloat(batchIntervalHours || "0");
      const startIso = batchInterviewDate && batchInterviewTime
        ? new Date(`${batchInterviewDate}T${batchInterviewTime}`).toISOString()
        : new Date(batchInterviewDate).toISOString();

      const res = await apiRequest("PATCH", "/api/applications/bulk/interview", {
        applicationIds: selectedApplications,
        start: startIso,
        intervalHours: interval,
        location: batchLocation,
        timeRangeLabel: interval === 0 && batchInterviewTime
          ? batchInterviewTime
          : undefined,
        notes: batchNotes || undefined,
        stageId: batchStageId ? parseInt(batchStageId, 10) : undefined,
      });
      return await res.json();
    },
    onSuccess: (data: { total: number; scheduledCount: number; failedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      setShowBatchInterviewDialog(false);
      setBatchInterviewDate("");
      setBatchInterviewTime("");
      setBatchIntervalHours("0");
      setBatchLocation("");
      setBatchNotes("");
      setBatchStageId("");
      toast({
        title: "Batch interviews scheduled",
        description: `${data.scheduledCount} of ${data.total} candidates scheduled.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Batch scheduling failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ATS: Add recruiter note mutation
  const addNoteMutation = useMutation({
    mutationFn: async ({ applicationId, note }: { applicationId: number; note: string }) => {
      const res = await apiRequest("POST", `/api/applications/${applicationId}/notes`, {
        note,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      setNewRecruiterNote("");
      toast({
        title: "Note added",
        description: "Recruiter note has been added successfully.",
      });
    },
  });

  // ATS: Set rating mutation
  const setRatingMutation = useMutation({
    mutationFn: async ({ applicationId, rating }: { applicationId: number; rating: number }) => {
      const res = await apiRequest("PATCH", `/api/applications/${applicationId}/rating`, {
        rating,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "applications"] });
      toast({
        title: "Rating updated",
        description: "Candidate rating has been updated successfully.",
      });
    },
  });

  const handleStatusUpdate = (applicationId: number, status: string, notes?: string) => {
    updateStatusMutation.mutate({
      applicationId,
      status,
      ...(notes !== undefined && { notes })
    });
  };

  const handleResumeDownload = (application: Application) => {
    // Use secure, permission-gated endpoint
    window.open(`/api/applications/${application.id}/resume`, '_blank');
    // Track download for analytics/status (server also marks for recruiter/admin)
    markDownloadedMutation.mutate(application.id);
  };

  const handleApplicationView = (applicationId: number) => {
    markViewedMutation.mutate(applicationId);
  };

  // Kanban-specific handlers
  const handleToggleSelect = (id: number) => {
    setSelectedApplications((prev) =>
      prev.includes(id) ? prev.filter((appId) => appId !== id) : [...prev, id]
    );
  };

  const handleOpenDetails = async (application: Application) => {
    setSelectedApp(application);
    setSelectedAppResumeText(null);
    handleApplicationView(application.id);

    // Fetch resume text in background for fallback display
    if (application.id) {
      try {
        const res = await fetch(`/api/applications/${application.id}/resume-text`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.text === "string") {
            setSelectedAppResumeText(data.text);
          }
        }
      } catch {
        // Ignore - fallback text unavailable
      }
    }
  };

  const handleCloseDetails = () => {
    setSelectedApp(null);
    setSelectedAppResumeText(null);
  };

  const handleDragCancel = () => {
    toast({
      title: "Drag cancelled",
      description: "Drop onto a stage column to move the application.",
    });
  };

  const handleDragEnd = async (applicationId: number, targetStageId: number) => {
    // Optimistic update
    const previousApplications = applications;

    queryClient.setQueryData(["/api/jobs", jobId, "applications"], (old: Application[] | undefined) => {
      if (!old) return old;
      return old.map((app) =>
        app.id === applicationId ? { ...app, currentStage: targetStageId } : app
      );
    });

    try {
      await updateStageMutation.mutateAsync({
        applicationId,
        stageId: targetStageId
      });
    } catch (error) {
      // Revert on error
      queryClient.setQueryData(["/api/jobs", jobId, "applications"], previousApplications);
      toast({
        title: "Move failed",
        description: "Failed to move application. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBulkMoveStage = async (stageId: number) => {
    if (selectedApplications.length === 0) {
      toast({
        title: "No applications selected",
        description: "Please select applications first.",
        variant: "destructive",
      });
      return;
    }

    let success = 0;
    let failed = 0;
    const total = selectedApplications.length;

    setBulkProgress({ sent: 0, total });

    // Process with concurrency limit of 3
    const concurrencyLimit = 3;
    for (let i = 0; i < selectedApplications.length; i += concurrencyLimit) {
      const batch = selectedApplications.slice(i, i + concurrencyLimit);
      await Promise.allSettled(
        batch.map(async (id) => {
          try {
            await updateStageMutation.mutateAsync({ applicationId: id, stageId });
            success++;
          } catch {
            failed++;
          } finally {
            setBulkProgress((p) => ({ sent: Math.min(p.sent + 1, total), total }));
          }
        })
      );
    }

    setBulkProgress({ sent: 0, total: 0 });
    setSelectedApplications([]);

    toast({
      title: "Bulk move complete",
      description: `Moved: ${success}, Failed: ${failed}`,
    });
  };

  const handleBulkSendEmails = async (templateId: number) => {
    await sendBulkEmailsMutation.mutateAsync({
      applicationIds: selectedApplications,
      templateId,
    });
  };

  const handleBulkSendForms = async (formId: number, message: string) => {
    await sendBulkFormsMutation.mutateAsync({
      applicationIds: selectedApplications,
      formId,
      ...(message && { customMessage: message })
    });
  };

  const handleClearSelection = () => {
    setSelectedApplications([]);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      // Select all filtered applications
      setSelectedApplications(filteredApplications.map(app => app.id));
    } else {
      setSelectedApplications([]);
    }
  };

  // Archive (uses bulk status update to mark as rejected with archive note)
  const handleArchiveSelected = async () => {
    if (selectedApplications.length === 0) return;
    await bulkUpdateMutation.mutateAsync({
      applicationIds: selectedApplications,
      status: 'rejected',
      notes: '[Archived via bulk action]'
    });
  };

  const handleMoveStageFromPanel = (stageId: number, notes?: string) => {
    if (!selectedApp) return;
    updateStageMutation.mutate({
      applicationId: selectedApp.id,
      stageId,
      ...(notes && { notes }),
    });
  };

  const handleScheduleInterviewFromPanel = (data: {
    date: string;
    time: string;
    location: string;
    notes: string;
  }) => {
    if (!selectedApp) return;
    scheduleInterviewMutation.mutate({
      applicationId: selectedApp.id,
      ...data,
    });
  };

  const handleSendEmailFromPanel = (templateId: number) => {
    if (!selectedApp) return;
    sendEmailMutation.mutate({
      applicationId: selectedApp.id,
      templateId,
    });
  };

  const handleSendFormFromPanel = (formId: number, message: string) => {
    if (!selectedApp) return;
    formsApi.createInvitation({
      applicationId: selectedApp.id,
      formId,
      ...(message && { customMessage: message })
    }).then(() => {
      toast({
        title: "Invitation sent",
        description: "Form invitation has been sent successfully.",
      });
    }).catch((error) => {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    });
  };

  const handleAddNoteFromPanel = (note: string) => {
    if (!selectedApp) return;
    addNoteMutation.mutate({
      applicationId: selectedApp.id,
      note,
    });
  };

  const handleSetRatingFromPanel = (rating: number) => {
    if (!selectedApp) return;
    setRatingMutation.mutate({
      applicationId: selectedApp.id,
      rating,
    });
  };

  const handleDownloadResumeFromPanel = () => {
    if (!selectedApp) return;
    handleResumeDownload(selectedApp);
  };

  // Export applications to CSV
  const handleExportCSV = () => {
    if (!applications || applications.length === 0) {
      toast({
        title: "No Data",
        description: "There are no applications to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Helper to escape CSV values
      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Get stage name helper
      const getStageName = (stageId: number | null | undefined): string => {
        if (!stageId || !pipelineStages) return 'Unassigned';
        const stage = pipelineStages.find(s => s.id === stageId);
        return stage?.name || 'Unknown';
      };

      // CSV header
      const headers = [
        'Name',
        'Email',
        'Phone',
        'Status',
        'Pipeline Stage',
        'Applied Date',
        'AI Fit Score',
        'AI Fit Label',
        'Rating',
        'Tags',
        'Resume URL'
      ];

      // CSV rows
      const rows = applications.map(app => [
        escapeCsv(app.name),
        escapeCsv(app.email),
        escapeCsv(app.phone),
        escapeCsv(app.status),
        escapeCsv(getStageName(app.currentStage)),
        escapeCsv(app.appliedAt ? new Date(app.appliedAt).toISOString() : ''),
        escapeCsv(app.aiFitScore),
        escapeCsv(app.aiFitLabel),
        escapeCsv(app.rating),
        escapeCsv(app.tags?.join('; ')),
        escapeCsv(app.resumeUrl)
      ].join(','));

      // Combine header and rows
      const csvContent = '\ufeff' + headers.join(',') + '\n' + rows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `applications-${job?.title?.replace(/[^a-z0-9]/gi, '-') || 'export'}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Exported ${applications.length} application(s) to CSV.`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export applications.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      submitted: { color: "bg-info/10 text-info-foreground border-info/30", icon: Clock },
      reviewed: { color: "bg-warning/10 text-warning-foreground border-warning/30", icon: Eye },
      shortlisted: { color: "bg-success/10 text-success-foreground border-success/30", icon: UserCheck },
      rejected: { color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
      downloaded: { color: "bg-primary/10 text-primary border-primary/30", icon: Download },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.submitted;
    const Icon = config.icon;

    return (
      <Badge variant="secondary" className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredApplications = applications?.filter(app => {
    const matchesStage = stageFilter === 'all' ||
                         (stageFilter === 'unassigned' && app.currentStage == null) ||
                         (stageFilter !== 'unassigned' && app.currentStage === parseInt(stageFilter));
    const matchesSearch = searchQuery === '' ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.email.toLowerCase().includes(searchQuery.toLowerCase());
    // AI Suggested Action Filter
    const matchesAction = actionFilter.length === 0 ||
      (actionFilter.includes('Not Analyzed') && !app.aiSuggestedAction) ||
      (app.aiSuggestedAction && actionFilter.includes(app.aiSuggestedAction));
    return matchesStage && matchesSearch && matchesAction;
  }).sort((a, b) => {
    // AI Fit Sorting
    if (sortBy === 'ai_fit') {
      const scoreA = a.aiFitScore || 0;
      const scoreB = b.aiFitScore || 0;
      return scoreB - scoreA; // Higher scores first
    }
    // Default: Sort by date (newest first)
    return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
  }) || [];

  // AI Summary: Calculate to-generate count (apps needing summaries)
  // Use full applications list (not filteredApplications) to handle selections persisting across filters
  const selectedAppsData = (applications || []).filter(app => selectedApplications.includes(app.id));
  const appsWithSummary = selectedAppsData.filter(app => app.aiSummary);
  const appsWithoutSummary = selectedAppsData.filter(app => !app.aiSummary);
  const toGenerateCount = regenerateSummaries ? selectedAppsData.length : appsWithoutSummary.length;
  const willSkipCount = regenerateSummaries ? 0 : appsWithSummary.length;

  // Visible apps for current tab (used by Select All)
  const getVisibleApplications = (): Application[] => {
    if (!applications) return [];
    if (selectedTab === 'all') return filteredApplications;
    if (selectedTab === 'unassigned') return getApplicationsWithoutStage();
    if (selectedTab.startsWith('stage-')) {
      const sid = parseInt(selectedTab.split('-')[1] || '0');
      return getApplicationsByStage(sid);
    }
    return [];
  };

  const getApplicationsByStage = (stageId: number) => {
    return applications?.filter(app => app.currentStage === stageId) || [];
  };

  const getApplicationsWithoutStage = () => {
    // Explicitly check for null/undefined (stage IDs start from 1, but be defensive)
    return applications?.filter(app => app.currentStage == null) || [];
  };


  if (jobLoading || applicationsLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-7xl mx-auto space-y-6 pt-8">
            <PageHeaderSkeleton />
            <Card className="shadow-sm">
              <CardHeader>
                <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                <div className="h-4 w-64 bg-muted rounded animate-pulse mt-2" />
              </CardHeader>
            </Card>
            <FilterBarSkeleton />
            <div className="rounded-lg border border-border bg-card shadow-sm p-4">
              <KanbanBoardSkeleton columns={5} />
            </div>
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
              <p className="text-muted-foreground">
                {jobError?.message || "The requested job could not be found."}
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`container mx-auto px-4 py-8 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <div className="flex items-center gap-3 pt-8 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/my-jobs")}
              className="text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Back to My Jobs</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </div>

          {/* Job-Level Sub Navigation */}
          <div data-tour="job-context">
            <JobSubNav jobId={jobId!} jobTitle={job.title} className="mb-6" />
          </div>

          {/* Quick Actions Toolbar */}
          <div className="flex flex-col md:flex-row justify-end gap-4 mb-6">

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedApplications.length === 0) {
                    toast({
                      title: "No candidates selected",
                      description: "Select candidates using the checkboxes first.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (selectedApplications.length > 20) {
                    const ok = window.confirm(
                      `You are about to email ${selectedApplications.length} candidates. Proceed?`
                    );
                    if (!ok) return;
                  }
                  setShowBulkEmailDialog(true);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Bulk Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedApplications.length === 0) {
                    toast({
                      title: "No candidates selected",
                      description: "Select candidates using the checkboxes first.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (selectedApplications.length > 20) {
                    const ok = window.confirm(
                      `You are about to send forms to ${selectedApplications.length} candidates. Proceed?`
                    );
                    if (!ok) return;
                  }
                  setShowBulkFormsDialog(true);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Bulk Form
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedApplications.length === 0) {
                    toast({
                      title: "No candidates selected",
                      description: "Select candidates using the checkboxes first.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!job?.clientId) {
                    toast({
                      title: "No client linked",
                      description: "Set a client for this job before sharing a shortlist.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowShareShortlistDialog(true);
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Share with Client
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedApplications.length === 0) {
                    toast({
                      title: "No candidates selected",
                      description: "Select candidates using the checkboxes first.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowBatchInterviewDialog(true);
                }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Batch Interview
              </Button>
              <Button size="sm" onClick={() => setAddCandidateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Candidate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV()}
                disabled={!applications || applications.length === 0}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-7 w-7 text-primary" />
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                Application Management
              </h1>
            </div>
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
              Review and manage applications for "{job.title}"
            </p>
          </div>

          {/* Pending Approval Alert */}
          {job.status === 'pending' && (
            <Alert className="mb-4 border-warning/50 bg-warning/10">
              <Clock className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning-foreground">Pending Approval</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                This job is waiting for admin approval. It will become visible to candidates once approved.
                You can still prepare by setting up pipeline stages and reviewing any existing applications.
              </AlertDescription>
            </Alert>
          )}

          {/* Job Header */}
          <Card className="mb-4 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground text-xl">{job.title}</CardTitle>
                {job.status === 'pending' && (
                  <Badge className="bg-warning/10 text-warning-foreground border-warning/30">
                    Pending Approval
                  </Badge>
                )}
              </div>
              <CardDescription>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {job.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Posted {formatDate(job.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {applications?.length || 0} Applications
                  </span>
                </div>
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Sort & Filter Controls */}
          <Card className="mb-6 shadow-sm" data-tour="applications-filters">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="sort-select" className="text-sm font-medium text-foreground">
                    Sort by:
                  </Label>
                  <Select value={sortBy} onValueChange={(value: 'date' | 'ai_fit') => setSortBy(value)}>
                    <SelectTrigger id="sort-select" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Newest First</SelectItem>
                      <SelectItem value="ai_fit">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI Fit Score
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Stage Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="stage-filter" className="text-sm font-medium text-foreground">
                    Stage:
                  </Label>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger id="stage-filter" className="w-48">
                      <SelectValue placeholder="All stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {pipelineStages
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((stage) => (
                          <SelectItem key={stage.id} value={stage.id.toString()}>
                            {stage.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Recommended Action Filter */}
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">AI Action:</Label>
                  <span
                    className="cursor-help"
                    title="Filter by AI's recommended next step for each candidate"
                  >
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['advance', 'hold', 'reject', 'Not Analyzed'].map((action) => {
                      const isActive = actionFilter.includes(action);
                      const displayLabel = action === 'Not Analyzed' ? 'Not Analyzed' : action.charAt(0).toUpperCase() + action.slice(1);
                      const getActionStyle = () => {
                        if (!isActive) return 'hover:bg-muted';
                        switch (action) {
                          case 'advance': return 'bg-green-500 text-white hover:bg-green-600';
                          case 'hold': return 'bg-amber-500 text-white hover:bg-amber-600';
                          case 'reject': return 'bg-red-500 text-white hover:bg-red-600';
                          case 'Not Analyzed': return 'bg-gray-500 text-white hover:bg-gray-600';
                          default: return 'bg-primary text-primary-foreground hover:bg-primary/90';
                        }
                      };
                      return (
                        <Badge
                          key={action}
                          variant={isActive ? "default" : "outline"}
                          className={`cursor-pointer transition-all text-xs ${getActionStyle()}`}
                          onClick={() => {
                            setActionFilter((prev) =>
                              isActive
                                ? prev.filter((a) => a !== action)
                                : [...prev, action]
                            );
                          }}
                        >
                          {displayLabel}
                        </Badge>
                      );
                    })}
                    {actionFilter.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setActionFilter([])}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Results Count */}
                <div className="ml-auto text-sm text-muted-foreground">
                  {filteredApplications.length} of {applications?.length || 0} applications
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kanban Board Section */}
          <div data-tour="bulk-actions">
          <BulkActionBar
            selectedCount={selectedApplications.length}
            totalCount={filteredApplications.length}
            pipelineStages={pipelineStages}
            emailTemplates={emailTemplates}
            formTemplates={formTemplates}
            onMoveStage={handleBulkMoveStage}
            onSendEmails={handleBulkSendEmails}
            onSendForms={handleBulkSendForms}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onArchiveSelected={handleArchiveSelected}
            isBulkProcessing={sendBulkEmailsMutation.isPending || sendBulkFormsMutation.isPending || bulkUpdateMutation.isPending || startAISummaryMutation.isPending || !!aiSummaryJobId}
            bulkProgress={bulkProgress}
            onGenerateAISummary={() => setShowAISummaryDialog(true)}
            aiSummaryEnabled={true}
            aiSummaryLimit={summaryLimitStatus?.effectiveRemaining}
            aiSummaryToGenerateCount={toGenerateCount}
          />
          </div>

          {/* Kanban Board */}
          <div className="min-h-[600px] rounded-lg border border-border bg-card shadow-sm p-4 overflow-auto" data-tour="kanban-board">
            <KanbanBoard
              applications={filteredApplications}
              pipelineStages={pipelineStages.sort((a, b) => a.order - b.order)}
              selectedIds={selectedApplications}
              onToggleSelect={handleToggleSelect}
              onOpenDetails={handleOpenDetails}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              onQuickMoveStage={(appId, stageId) => {
                updateStageMutation.mutate({ applicationId: appId, stageId });
              }}
              onQuickEmail={(appId) => {
                const app = applications?.find(a => a.id === appId);
                if (app) {
                  handleOpenDetails(app);
                }
              }}
              onQuickInterview={(appId) => {
                const app = applications?.find(a => a.id === appId);
                if (app) {
                  handleOpenDetails(app);
                }
              }}
              onQuickDownload={(appId) => {
                window.open(`/api/applications/${appId}/resume`, '_blank');
              }}
              onToggleStageSelect={(stageId, shouldSelect) => {
                const stageApps = applications?.filter(app => 
                  // Handle unassigned (stageId null) vs specific stage
                  stageId === null ? app.currentStage === null : app.currentStage === stageId
                ) || [];
                const stageAppIds = stageApps.map(app => app.id);

                if (shouldSelect) {
                  // Exclusive selection: Select ONLY this stage's apps
                  setSelectedApplications(stageAppIds);
                } else {
                  // Deselect ONLY this stage's apps
                  setSelectedApplications(prev => prev.filter(id => !stageAppIds.includes(id)));
                }
              }}
            />
          </div>

          {/* Application Detail Modal */}
          <ApplicationDetailModal
            application={selectedApp}
            jobId={jobId!}
            pipelineStages={pipelineStages}
            emailTemplates={emailTemplates}
            formTemplates={formTemplates}
            stageHistory={stageHistory}
            resumeText={selectedAppResumeText}
            open={!!selectedApp}
            onClose={handleCloseDetails}
            onMoveStage={handleMoveStageFromPanel}
            onScheduleInterview={handleScheduleInterviewFromPanel}
            onSendEmail={handleSendEmailFromPanel}
            onSendForm={handleSendFormFromPanel}
            onAddNote={handleAddNoteFromPanel}
            onSetRating={handleSetRatingFromPanel}
            onDownloadResume={handleDownloadResumeFromPanel}
            onUpdateStatus={(status: string, notes?: string) => {
              if (!selectedApp) return;
              handleStatusUpdate(selectedApp.id, status, notes);
            }}
          />
        </div>

        {/* ATS Dialogs */}

        {/* Interview Scheduling Dialog */}
        <Dialog key={`interview-${selectedApp?.id ?? 'none'}`} open={showInterviewDialog} onOpenChange={setShowInterviewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Interview - {selectedApp?.name}</DialogTitle>
              <DialogDescription>
                Set interview details for this candidate
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="datetime-local"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Time</Label>
                <Input
                  type="text"
                  placeholder="e.g., 10:00 AM - 11:00 AM"
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  type="text"
                  placeholder="e.g., Zoom link or office address"
                  value={interviewLocation}
                  onChange={(e) => setInterviewLocation(e.target.value)}
                />
              </div>
              <div>
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                />
              </div>
              <Button
                onClick={() =>
                  selectedApp &&
                  scheduleInterviewMutation.mutate({
                    applicationId: selectedApp.id,
                    date: interviewDate,
                    time: interviewTime,
                    location: interviewLocation,
                    notes: interviewNotes,
                  })
                }
                disabled={!interviewDate || !interviewTime || !interviewLocation || scheduleInterviewMutation.isPending}
                className="w-full"
              >
                {scheduleInterviewMutation.isPending ? "Scheduling..." : "Schedule Interview"}
              </Button>

              {/* Download Calendar Invite - show if interview is already scheduled */}
              {selectedApp?.interviewDate && selectedApp?.interviewTime && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Interview scheduled for {new Date(selectedApp.interviewDate).toLocaleDateString()} at {selectedApp.interviewTime}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(`/api/applications/${selectedApp.id}/interview/ics`, '_blank');
                    }}
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Download Calendar Invite (.ics)
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Share this file with the interview panel and candidate to add the interview to their calendars
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Email Sending Dialog */}
        <Dialog key={`email-${selectedApp?.id ?? 'none'}`} open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Email - {selectedApp?.name}</DialogTitle>
              <DialogDescription>
                Select a template to send to this candidate
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Email Template</Label>
                <Select
                  value={selectedTemplateId?.toString() || ""}
                  onValueChange={(value) => setSelectedTemplateId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} - {template.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplateId && (
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-sm text-muted-foreground">Preview</Label>
                  <p className="text-sm text-foreground mt-1">
                    {emailTemplates.find(t => t.id === selectedTemplateId)?.body.substring(0, 200)}...
                  </p>
                </div>
              )}
              <Button
                onClick={() =>
                  selectedApp &&
                  selectedTemplateId &&
                  sendEmailMutation.mutate({
                    applicationId: selectedApp.id,
                    templateId: selectedTemplateId,
                  })
                }
                disabled={!selectedTemplateId || sendEmailMutation.isPending}
                className="w-full"
              >
                {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share Shortlist Dialog */}
        <Dialog open={showShareShortlistDialog} onOpenChange={setShowShareShortlistDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Shortlist with Client</DialogTitle>
              <DialogDescription>
                Create a client-ready shortlist link for the selected candidates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Client</Label>
                <p className="text-sm text-foreground font-medium">
                  {job?.clientId ? job?.title : "No client linked to this job"}
                </p>
                {!job?.clientId && (
                  <p className="text-xs text-destructive mt-1">
                    Link a client to this job on the job posting to enable sharing.
                  </p>
                )}
              </div>
              <div>
                <Label>Shortlist Title (Optional)</Label>
                <Input
                  value={shortlistTitle}
                  onChange={(e) => setShortlistTitle(e.target.value)}
                  placeholder={job?.title || "e.g., Frontend Engineer Shortlist"}
                />
              </div>
              <div>
                <Label>Message to Client (Optional)</Label>
                <Textarea
                  value={shortlistMessage}
                  onChange={(e) => setShortlistMessage(e.target.value)}
                  placeholder="Context for this shortlist, expectations, or notes for the client..."
                  rows={3}
                />
              </div>
              <div>
                <Label>Expires At (Optional)</Label>
                <Input
                  type="date"
                  value={shortlistExpiresAt}
                  onChange={(e) => setShortlistExpiresAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to keep the shortlist active indefinitely.
                </p>
              </div>

              {shortlistUrl && (
                <div className="p-3 bg-muted/50 border border-border rounded-md space-y-2">
                  <Label className="text-xs text-muted-foreground">Shareable Link</Label>
                  <div className="flex items-center gap-2">
                    <Input value={shortlistUrl} readOnly className="text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(shortlistUrl)
                          .then(() =>
                            toast({
                              title: "Link Copied",
                              description: "Shortlist link copied to clipboard.",
                            })
                          )
                          .catch(() =>
                            toast({
                              title: "Copy Failed",
                              description: "Could not copy the link. Please copy it manually.",
                              variant: "destructive",
                            })
                          );
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowShareShortlistDialog(false);
                  setShortlistUrl(null);
                  setShortlistTitle("");
                  setShortlistMessage("");
                  setShortlistExpiresAt("");
                }}
              >
                Close
              </Button>
              <Button
                onClick={() => createShortlistMutation.mutate()}
                disabled={
                  !job?.clientId ||
                  selectedApplications.length === 0 ||
                  createShortlistMutation.isPending
                }
              >
                {createShortlistMutation.isPending ? "Creating..." : "Create Shortlist"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Email Dialog */}
        <Dialog key={`bulk-email-${selectedApplications.length}`} open={showBulkEmailDialog} onOpenChange={setShowBulkEmailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Bulk Email - {selectedApplications.length} selected</DialogTitle>
              <DialogDescription>
                Choose a template to send to all selected candidates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-3 p-2 bg-muted/50 rounded border border-border">
                <Checkbox
                  checked={getVisibleApplications().every(a => selectedApplications.includes(a.id)) && getVisibleApplications().length > 0}
                  onCheckedChange={(checked) => {
                    const visible = getVisibleApplications().map(a => a.id);
                    if (checked) {
                      setSelectedApplications(Array.from(new Set([...selectedApplications, ...visible])));
                    } else {
                      setSelectedApplications(selectedApplications.filter(id => !visible.includes(id)));
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">Select all in current view</span>
                {selectedApplications.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground underline ml-auto hover:text-foreground"
                    onClick={() => setSelectedApplications([])}
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div>
                <Label>Email Template</Label>
                <Select
                  value={bulkTemplateId?.toString() || ""}
                  onValueChange={(value) => setBulkTemplateId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} - {template.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bulkTemplateId && (
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-sm text-muted-foreground">Preview</Label>
                  <p className="text-sm text-foreground mt-1">
                    {emailTemplates.find((t) => t.id === bulkTemplateId)?.body.substring(0, 200)}...
                  </p>
                </div>
              )}
              <Button
                onClick={() =>
                  bulkTemplateId &&
                  sendBulkEmailsMutation.mutate({
                    applicationIds: selectedApplications,
                    templateId: bulkTemplateId,
                  })
                }
                disabled={!bulkTemplateId || sendBulkEmailsMutation.isPending}
                className="w-full"
              >
                {sendBulkEmailsMutation.isPending ? "Sending..." : "Send to Selected"}
              </Button>
              {sendBulkEmailsMutation.isPending && (
                <p className="text-xs text-muted-foreground text-center">
                  Sending {bulkProgress.sent}/{bulkProgress.total}...
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Forms Dialog */}
        <Dialog key={`bulk-forms-${selectedApplications.length}`} open={showBulkFormsDialog} onOpenChange={setShowBulkFormsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Bulk Form - {selectedApplications.length} selected</DialogTitle>
              <DialogDescription>
                Choose a form template to send to all selected candidates
              </DialogDescription>
            </DialogHeader>
            {/* Invitation Quota Display */}
            {invitationQuota && (
              <div className={`flex items-center justify-between p-2 rounded-md text-sm ${
                invitationQuota.remaining === 0
                  ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                  : invitationQuota.remaining <= 10
                  ? 'bg-warning/10 border border-warning/30 text-warning-foreground'
                  : 'bg-info/10 border border-info/30 text-info-foreground'
              }`}>
                <span>
                  {invitationQuota.remaining === 0
                    ? 'Daily invite limit reached'
                    : `${invitationQuota.remaining} invites remaining today`}
                </span>
                <span className="text-xs opacity-75">
                  ({invitationQuota.used}/{invitationQuota.limit} used)
                </span>
              </div>
            )}
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-3 p-2 bg-muted/50 rounded border border-border">
                <Checkbox
                  checked={getVisibleApplications().every(a => selectedApplications.includes(a.id)) && getVisibleApplications().length > 0}
                  onCheckedChange={(checked) => {
                    const visible = getVisibleApplications().map(a => a.id);
                    if (checked) {
                      setSelectedApplications(Array.from(new Set([...selectedApplications, ...visible])));
                    } else {
                      setSelectedApplications(selectedApplications.filter(id => !visible.includes(id)));
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">Select all in current view</span>
                {selectedApplications.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground underline ml-auto hover:text-foreground"
                    onClick={() => setSelectedApplications([])}
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div>
                <Label>Form Template</Label>
                <Select
                  value={bulkFormId?.toString() || ""}
                  onValueChange={(value) => setBulkFormId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select form template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                        {template.description && ` - ${template.description.substring(0, 50)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bulkFormId && (
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-sm text-muted-foreground">Form Info</Label>
                  {(() => {
                    const template = formTemplates.find((t) => t.id === bulkFormId);
                    return template ? (
                      <div className="text-sm text-foreground mt-1">
                        <p className="font-medium">{template.name}</p>
                        {template.description && (
                          <p className="text-muted-foreground mt-1">{template.description}</p>
                        )}
                        <p className="text-muted-foreground mt-1">
                          {template.fields?.length || 0} question{template.fields?.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              <div>
                <Label>Custom Message (Optional)</Label>
                <Textarea
                  placeholder="Add a personal message for all selected candidates..."
                  value={bulkFormMessage}
                  onChange={(e) => setBulkFormMessage(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This message will be included in the invitation email for all candidates
                </p>
              </div>
              <Button
                onClick={() =>
                  bulkFormId &&
                  sendBulkFormsMutation.mutate({
                    applicationIds: selectedApplications,
                    formId: bulkFormId,
                    ...(bulkFormMessage && { customMessage: bulkFormMessage }),
                  })
                }
                disabled={!bulkFormId || sendBulkFormsMutation.isPending || (invitationQuota?.remaining === 0)}
                className="w-full"
              >
                {sendBulkFormsMutation.isPending
                  ? "Sending..."
                  : invitationQuota?.remaining === 0
                  ? "Daily limit reached"
                  : "Send to Selected"}
              </Button>
              {sendBulkFormsMutation.isPending && (
                <p className="text-xs text-muted-foreground text-center">
                  Sending {bulkFormsProgress.sent}/{bulkFormsProgress.total}...
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Batch Interview Dialog */}
        <Dialog open={showBatchInterviewDialog} onOpenChange={setShowBatchInterviewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Batch Interviews</DialogTitle>
              <DialogDescription>
                Schedule interviews for the selected candidates. Use an interval to create back-to-back slots.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground text-sm">Date</Label>
                  <Input
                    type="date"
                    value={batchInterviewDate}
                    onChange={(e) => setBatchInterviewDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-foreground text-sm">Start time</Label>
                  <Input
                    type="time"
                    value={batchInterviewTime}
                    onChange={(e) => setBatchInterviewTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground text-sm">Interval between interviews</Label>
                  <Select
                    value={batchIntervalHours}
                    onValueChange={setBatchIntervalHours}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Interval" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 hours (same time)</SelectItem>
                      <SelectItem value="0.5">0.5 hours</SelectItem>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="3">3 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground text-sm">Move to stage</Label>
                  <Select
                    value={batchStageId}
                    onValueChange={setBatchStageId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Keep current" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id.toString()}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-foreground text-sm">Location</Label>
                <Input
                  placeholder="e.g. Zoom link or office address"
                  value={batchLocation}
                  onChange={(e) => setBatchLocation(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-foreground text-sm">Notes (optional)</Label>
                <Textarea
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="Add any interviewer or candidate instructions..."
                />
              </div>

              <p className="text-xs text-muted-foreground">
                When an interval is set, each candidate will be scheduled in sequence starting from the selected time.
                Times are based on your browser&apos;s local timezone.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowBatchInterviewDialog(false)}
                disabled={batchInterviewMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => batchInterviewMutation.mutate()}
                disabled={
                  batchInterviewMutation.isPending ||
                  !batchInterviewDate ||
                  !batchLocation ||
                  selectedApplications.length === 0
                }
              >
                {batchInterviewMutation.isPending ? "Scheduling..." : "Schedule Interviews"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stage History Dialog */}
        <Dialog key={`history-${selectedApp?.id ?? 'none'}`} open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Stage History - {selectedApp?.name}</DialogTitle>
              <DialogDescription>
                Timeline of all stage changes for this application
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4 max-h-96 overflow-y-auto">
              {stageHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No stage history available</p>
              ) : (
                stageHistory.map((history: any, idx: number) => {
                  const fromStage = pipelineStages.find(s => s.id === history.fromStage);
                  const toStage = pipelineStages.find(s => s.id === history.toStage);

                  return (
                    <div key={idx} className="flex gap-4 p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="flex-shrink-0">
                        <div
                          className="w-3 h-3 rounded-full mt-1"
                          style={{ backgroundColor: toStage?.color || '#6b7280' }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {fromStage && fromStage.color && (
                            <Badge
                              style={{
                                backgroundColor: `${fromStage.color}20`,
                                borderColor: fromStage.color,
                                color: fromStage.color
                              }}
                              className="border text-xs"
                            >
                              {fromStage.name}
                            </Badge>
                          )}
                          <span className="text-slate-400">→</span>
                          {toStage && toStage.color && (
                            <Badge
                              style={{
                                backgroundColor: `${toStage.color}20`,
                                borderColor: toStage.color,
                                color: toStage.color
                              }}
                              className="border text-xs"
                            >
                              {toStage.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(history.changedAt)}
                        </p>
                        {history.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{history.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Forms Dialog */}
        {selectedApp && (
          <FormsModal
            key={selectedApp.id}
            open={showFormsDialog}
            onOpenChange={setShowFormsDialog}
            application={selectedApp}
          />
        )}

        {/* Add Candidate Intake Form */}
        {jobId && (
          <CandidateIntakeForm
            jobId={jobId}
            open={addCandidateModalOpen}
            onOpenChange={setAddCandidateModalOpen}
          />
        )}

        {/* AI Summary Dialog */}
        <Dialog open={showAISummaryDialog} onOpenChange={(open) => {
          if (!open && !aiSummaryJobId) {
            setShowAISummaryDialog(false);
            setRegenerateSummaries(false);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Generate AI Summaries
              </DialogTitle>
              <DialogDescription>
                Generate AI-powered candidate summaries with suggested actions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Selection and generation counts */}
              <div className="text-sm bg-muted/30 p-3 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Selected candidates:</span>
                  <span className="font-medium">{selectedApplications.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Will generate:</span>
                  <span className="font-medium text-primary">{toGenerateCount}</span>
                </div>
                {willSkipCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Already have summaries (will skip):</span>
                    <span className="font-medium text-muted-foreground">{willSkipCount}</span>
                  </div>
                )}
              </div>

              {/* Error: selected > 50 */}
              {selectedApplications.length > 50 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Too many selected</AlertTitle>
                  <AlertDescription>
                    Please select 50 or fewer candidates. You have {selectedApplications.length} selected.
                  </AlertDescription>
                </Alert>
              )}

              {/* Error: to-generate > remaining limit */}
              {summaryLimitStatus && selectedApplications.length <= 50 && toGenerateCount > summaryLimitStatus.effectiveRemaining && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Daily limit exceeded</AlertTitle>
                  <AlertDescription>
                    You have only {summaryLimitStatus.effectiveRemaining} analyses left today.
                    {toGenerateCount} would be generated. Reduce selection or check "Regenerate" to skip fewer.
                  </AlertDescription>
                </Alert>
              )}

              {/* Budget warning */}
              {summaryLimitStatus && !summaryLimitStatus.budgetAllowed && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Service Unavailable</AlertTitle>
                  <AlertDescription>
                    AI service is temporarily unavailable. Please try again later.
                  </AlertDescription>
                </Alert>
              )}

              {/* Limit status info */}
              {summaryLimitStatus && summaryLimitStatus.budgetAllowed && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <div className="flex justify-between">
                    <span>Daily limit:</span>
                    <span>{summaryLimitStatus.dailyUsed} / {summaryLimitStatus.dailyLimit} used</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Remaining:</span>
                    <span className="font-medium text-foreground">{summaryLimitStatus.effectiveRemaining}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Resets at:</span>
                    <span>{new Date(summaryLimitStatus.dailyResetAt).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Regenerate checkbox */}
              <div className="flex items-start gap-3 p-3 border border-border rounded-lg">
                <Checkbox
                  id="regenerate"
                  checked={regenerateSummaries}
                  onCheckedChange={(c) => setRegenerateSummaries(!!c)}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="regenerate" className="text-sm font-medium cursor-pointer">
                    Regenerate existing summaries
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    By default, candidates with existing summaries are skipped
                  </p>
                </div>
              </div>

              {/* Progress section when job running */}
              {aiSummaryJobId && (
                <div className="space-y-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                    <span className="text-sm font-medium">Generating summaries...</span>
                  </div>
                  <Progress value={summaryJobStatus?.progress || 0} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    {summaryJobStatus?.processedCount || 0} / {summaryJobStatus?.totalCount || 0} processed
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAISummaryDialog(false);
                  setRegenerateSummaries(false);
                }}
                disabled={startAISummaryMutation.isPending}
              >
                {aiSummaryJobId ? 'Close' : 'Cancel'}
              </Button>
              {aiSummaryJobId && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/ai/summary/jobs/${aiSummaryJobId}`, {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                      });
                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || 'Failed to cancel job');
                      }
                      setAiSummaryJobId(null);
                      toast({ title: 'Job Cancelled', description: 'AI summary generation cancelled.' });
                    } catch (err) {
                      toast({
                        title: 'Cancel Failed',
                        description: err instanceof Error ? err.message : 'Could not cancel the job',
                        variant: 'destructive'
                      });
                    }
                  }}
                >
                  Cancel Job
                </Button>
              )}
              {!aiSummaryJobId && (
                <Button
                  onClick={() => startAISummaryMutation.mutate({
                    applicationIds: selectedApplications,
                    regenerate: regenerateSummaries,
                  })}
                  disabled={
                    selectedApplications.length === 0 ||
                    toGenerateCount === 0 ||
                    selectedApplications.length > 50 ||
                    (summaryLimitStatus && toGenerateCount > summaryLimitStatus.effectiveRemaining) ||
                    (summaryLimitStatus && !summaryLimitStatus.budgetAllowed) ||
                    startAISummaryMutation.isPending
                  }
                >
                  {startAISummaryMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate {toGenerateCount} {toGenerateCount === 1 ? 'Summary' : 'Summaries'}
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
