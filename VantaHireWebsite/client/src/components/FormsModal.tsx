import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Application } from "@shared/schema";
import type { FormResponseDetailDTO, FormResponseSummaryDTO } from "@shared/forms.types";
import { formsApi, formsQueryKeys, type CreateInvitationRequest, type InvitationQuotaResponse } from "@/lib/formsApi";

interface FormsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application;
}

export function FormsModal({ open, onOpenChange, application }: FormsModalProps) {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<FormResponseSummaryDTO | null>(null);

  const formatShortDate = (value?: string | Date | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  // Reset selection/state when modal closes or application changes
  useEffect(() => {
    if (!open) {
      setSelectedResponse(null);
      setSelectedTemplateId(null);
      setCustomMessage("");
    }
  }, [open]);

  useEffect(() => {
    // When switching to a different candidate/application, ensure previous response isn't shown
    setSelectedResponse(null);
    setSelectedTemplateId(null);
    setCustomMessage("");
  }, [application.id]);

  // Fetch templates - types inferred from formsApi.listTemplates()
  const { data: templatesData } = useQuery({
    queryKey: formsQueryKeys.templates(),
    queryFn: formsApi.listTemplates,
    enabled: open,
  });

  // Fetch invitations for this application - types inferred
  const { data: invitationsData, isLoading: invitationsLoading } = useQuery({
    queryKey: formsQueryKeys.invitations(application.id),
    queryFn: () => formsApi.listInvitations(application.id),
    enabled: open,
  });

  // Fetch responses for this application - types inferred
  const { data: responsesData, isLoading: responsesLoading } = useQuery({
    queryKey: formsQueryKeys.responses(application.id),
    queryFn: () => formsApi.listResponses(application.id),
    enabled: open,
  });

  // Fetch invitation quota - remaining daily invites
  const { data: invitationQuota } = useQuery<InvitationQuotaResponse>({
    queryKey: formsQueryKeys.invitationQuota(),
    queryFn: () => formsApi.getInvitationQuota(),
    enabled: open,
    staleTime: 30_000, // Cache for 30 seconds
  });

  // Send invitation mutation - strongly typed request/response
  const sendInvitationMutation = useMutation({
    mutationFn: (data: CreateInvitationRequest) => formsApi.createInvitation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.invitations(application.id) });
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.invitationQuota() });
      toast({
        title: "Form Sent",
        description: "Form invitation has been sent successfully.",
      });
      setSelectedTemplateId(null);
      setCustomMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Form",
        description: error.message || "Failed to send form invitation.",
        variant: "destructive",
      });
    },
  });

  // Fetch detailed response when viewing - types inferred
  const { data: detailedResponse, isLoading: responseDetailLoading } = useQuery({
    queryKey: formsQueryKeys.responseDetail(selectedResponse?.id ?? 0),
    queryFn: () => formsApi.getResponseDetail(selectedResponse!.id),
    enabled: !!selectedResponse,
  });

  const handleSendForm = () => {
    if (!selectedTemplateId) {
      toast({
        title: "No Template Selected",
        description: "Please select a form template to send.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateInvitationRequest = {
      applicationId: application.id,
      formId: selectedTemplateId,
    };
    if (customMessage) {
      payload.customMessage = customMessage;
    }
    sendInvitationMutation.mutate(payload);
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`/api/forms/export?applicationId=${application.id}&format=csv`);
      if (!response.ok) throw new Error("Failed to export responses");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-responses-${application.id}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Form responses have been exported to CSV.",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export form responses.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
      pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
      sent: { color: "bg-info/10 text-info-foreground", icon: Send, label: "Sent" },
      viewed: { color: "bg-primary/10 text-primary", icon: Eye, label: "Viewed" },
      answered: { color: "bg-success/10 text-success-foreground", icon: CheckCircle2, label: "Answered" },
      expired: { color: "bg-warning/10 text-warning-foreground", icon: Clock, label: "Expired" },
      failed: { color: "bg-destructive/10 text-destructive", icon: XCircle, label: "Failed" },
    };

    const config = statusConfig[status] ?? statusConfig.pending!;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const invitations = invitationsData?.invitations || [];
  const responses = responsesData?.responses || [];
  const templates = templatesData?.templates || [];

  // Show detailed response view
  if (selectedResponse && detailedResponse) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent key={application.id} className="max-w-3xl max-h-[80vh] overflow-y-auto ">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {detailedResponse.formName} - Response
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Submitted by {detailedResponse.candidateName} ({detailedResponse.candidateEmail})
              <br />
              on {new Date(detailedResponse.submittedAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {detailedResponse.questionsAndAnswers.map((qa, idx) => (
              <Card key={idx} className="bg-muted/50 border-border">
                <CardContent className="pt-4">
                  <Label className="text-muted-foreground/50 font-medium">{qa.question}</Label>
                  <p className="text-foreground mt-2">
                    {qa.fileUrl ? (
                      <a
                        href={qa.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary underline inline-flex items-center gap-1"
                      >
                        <FileText className="w-4 h-4" />
                        View Uploaded File
                      </a>
                    ) : qa.answer || (
                      <span className="text-muted-foreground italic">No answer provided</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="secondary"
              onClick={() => setSelectedResponse(null)}
              className=""
            >
              Back to Forms
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main forms modal view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={application.id} className="max-w-3xl max-h-[80vh] overflow-y-auto ">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Forms - {application.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Send custom forms to the candidate and view their responses
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Send New Form Section */}
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-foreground font-medium">Send New Form</h3>
              {/* Invitation Quota Display */}
              {invitationQuota && (
                <span className={`text-xs px-2 py-1 rounded ${
                  invitationQuota.remaining === 0
                    ? 'bg-destructive/10 text-destructive'
                    : invitationQuota.remaining <= 10
                    ? 'bg-warning/10 text-warning-foreground'
                    : 'bg-info/10 text-info-foreground'
                }`}>
                  {invitationQuota.remaining} invites remaining today
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground">Select Form Template</Label>
                <Select
                  value={selectedTemplateId?.toString() || ""}
                  onValueChange={(value) => setSelectedTemplateId(parseInt(value))}
                >
                    <SelectTrigger className=" mt-1">
                      <SelectValue placeholder="Choose a form template..." />
                    </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        <div className="flex max-w-[280px] flex-col items-start gap-1 py-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {template.fields.length} fields
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {template.isPublished ? "Published" : "Draft"}
                            </span>
                            {formatShortDate(template.updatedAt) && (
                              <span className="text-xs text-muted-foreground">
                                Updated {formatShortDate(template.updatedAt)}
                              </span>
                            )}
                          </div>
                          {template.description && (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {template.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-muted-foreground">Custom Message (Optional)</Label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add a personalized message to include in the email..."
                  className=" mt-1"
                  rows={3}
                />
              </div>

              <Button
                onClick={handleSendForm}
                disabled={sendInvitationMutation.isPending || !selectedTemplateId || invitationQuota?.remaining === 0}
                className="w-full "
              >
                {sendInvitationMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : invitationQuota?.remaining === 0 ? (
                  <>
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Daily limit reached
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Form
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Invitations Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-foreground font-medium">Sent Forms</h3>
              {responses.length > 0 && (
                <Button
                  onClick={handleExportCSV}
                  variant="secondary"
                  size="sm"
                  className=""
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </div>

            {invitationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : invitations.length === 0 ? (
              <Card className="bg-muted/50 border-border">
                <CardContent className="py-8 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No forms sent yet</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Send a form using the section above
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation) => {
                  const response = responses.find((r) => r.invitationId === invitation.id);

                  return (
                    <Card key={invitation.id} className="bg-muted/50 border-border">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-foreground font-medium">{invitation.form.name}</h4>
                              {getStatusBadge(invitation.status)}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              {invitation.sentAt && (
                                <p>Sent: {new Date(invitation.sentAt).toLocaleString()}</p>
                              )}
                              {invitation.viewedAt && (
                                <p>Viewed: {new Date(invitation.viewedAt).toLocaleString()}</p>
                              )}
                              {invitation.answeredAt && response && (
                                <p>Answered: {new Date(invitation.answeredAt).toLocaleString()}</p>
                              )}
                              <p>Expires: {new Date(invitation.expiresAt).toLocaleString()}</p>
                            </div>
                          </div>
                          <div>
                            {response && (
                              <Button
                                onClick={() => setSelectedResponse(response)}
                                size="sm"
                                className="bg-success hover:bg-success/80"
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View Response
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
