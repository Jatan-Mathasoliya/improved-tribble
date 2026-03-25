import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  Filter,
  Download,
  Eye,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Loader2,
} from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formsApi, formsQueryKeys, type FormTemplateDTO } from "@/lib/formsApi";

interface FormResponseSummary {
  id: number;
  formId: number;
  formName: string;
  applicationId: number;
  candidateName: string;
  candidateEmail: string;
  submittedAt: string;
  status: string;
}

interface FormResponseDetail {
  id: number;
  formName: string;
  formDescription?: string;
  submittedAt: string;
  candidateName: string;
  candidateEmail: string;
  questionsAndAnswers: Array<{
    fieldId: number;
    question: string;
    fieldType: string;
    answer: string | null;
    fileUrl: string | null;
  }>;
}

interface AdminResponsesData {
  responses: FormResponseSummary[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    totalResponses: number;
    responsesToday: number;
    avgResponseTime: number;
    completionRate: number;
  };
}

export default function AdminFormResponsesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFormId, setSelectedFormId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedResponse, setSelectedResponse] = useState<FormResponseSummary | null>(null);
  const pageSize = 20;

  // Redirect non-admin users
  if (!user || user.role !== "super_admin") {
    return <Redirect to="/auth" />;
  }

  // Fetch all form templates for filter dropdown
  const { data: templatesData } = useQuery({
    queryKey: formsQueryKeys.templates(),
    queryFn: formsApi.listTemplates,
  });

  // Fetch form responses with filters
  const { data: responsesData, isLoading } = useQuery<AdminResponsesData>({
    queryKey: ["/api/admin/forms/responses", { page, search: searchTerm, formId: selectedFormId, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (searchTerm) params.append("search", searchTerm);
      if (selectedFormId !== "all") params.append("formId", selectedFormId);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await apiRequest("GET", `/api/admin/forms/responses?${params}`);
      return res.json();
    },
  });

  // Fetch response detail when viewing
  const { data: responseDetail, isLoading: detailLoading } = useQuery<FormResponseDetail>({
    queryKey: ["/api/forms/responses", selectedResponse?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/forms/responses/${selectedResponse!.id}`);
      return res.json();
    },
    enabled: !!selectedResponse,
  });

  const templates: FormTemplateDTO[] = templatesData?.templates || [];
  const responses = responsesData?.responses || [];
  const total = responsesData?.total || 0;
  const stats = responsesData?.stats || {
    totalResponses: 0,
    responsesToday: 0,
    avgResponseTime: 0,
    completionRate: 0,
  };

  const totalPages = Math.ceil(total / pageSize);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; icon: any; label: string }> = {
      pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
      sent: { color: "bg-info/10 text-info-foreground", icon: Send, label: "Sent" },
      viewed: { color: "bg-primary/10 text-primary", icon: Eye, label: "Viewed" },
      answered: { color: "bg-success/10 text-success-foreground", icon: CheckCircle2, label: "Answered" },
      expired: { color: "bg-warning/10 text-warning-foreground", icon: Clock, label: "Expired" },
      failed: { color: "bg-destructive/10 text-destructive", icon: XCircle, label: "Failed" },
    };
    const cfg = config[status] ?? config.pending!;
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {cfg.label}
      </Badge>
    );
  };

  const handleExportAll = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFormId !== "all") params.append("formId", selectedFormId);
      if (searchTerm) params.append("search", searchTerm);

      const res = await fetch(`/api/admin/forms/responses/export?${params}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-responses-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Export Complete", description: "Form responses exported successfully." });
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                Form Responses
              </h1>
              <p className="text-muted-foreground mt-1">View and manage all form responses across candidates</p>
            </div>
            <Button onClick={handleExportAll} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Responses</p>
                    <p className="text-2xl font-bold text-foreground">{stats.totalResponses}</p>
                  </div>
                  <FileText className="w-8 h-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Today</p>
                    <p className="text-2xl font-bold text-success">{stats.responsesToday}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-success opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-bold text-info">
                      {stats.avgResponseTime > 0 ? `${Math.round(stats.avgResponseTime)}h` : "N/A"}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-info opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Completion Rate</p>
                    <p className="text-2xl font-bold text-primary">
                      {stats.completionRate > 0 ? `${Math.round(stats.completionRate)}%` : "N/A"}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by candidate name or email..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={selectedFormId} onValueChange={(v) => { setSelectedFormId(v); setPage(1); }}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Forms</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="answered">Answered</SelectItem>
                    <SelectItem value="viewed">Viewed</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Responses Table */}
          <Card>
            <CardHeader>
              <CardTitle>Responses</CardTitle>
              <CardDescription>
                {total} total response{total !== 1 ? "s" : ""} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : responses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No form responses found</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Form</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {responses.map((response) => (
                        <TableRow key={response.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{response.candidateName}</p>
                              <p className="text-sm text-muted-foreground">{response.candidateEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell>{response.formName}</TableCell>
                          <TableCell>{getStatusBadge(response.status)}</TableCell>
                          <TableCell>
                            {response.submittedAt
                              ? new Date(response.submittedAt).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedResponse(response)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Response Detail Modal */}
        <Dialog open={!!selectedResponse} onOpenChange={(open) => !open && setSelectedResponse(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {responseDetail?.formName || "Form Response"}
              </DialogTitle>
              <DialogDescription>
                {responseDetail && (
                  <>
                    Submitted by {responseDetail.candidateName} ({responseDetail.candidateEmail})
                    <br />
                    on {new Date(responseDetail.submittedAt).toLocaleString()}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : responseDetail ? (
              <div className="space-y-4 mt-4">
                {responseDetail.questionsAndAnswers.map((qa, idx) => (
                  <Card key={idx} className="bg-muted/50">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">{qa.question}</p>
                      <p className="text-foreground">
                        {qa.fileUrl ? (
                          <a
                            href={qa.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <FileText className="w-4 h-4" />
                            View Uploaded File
                          </a>
                        ) : (
                          qa.answer || <span className="text-muted-foreground italic">No answer provided</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
