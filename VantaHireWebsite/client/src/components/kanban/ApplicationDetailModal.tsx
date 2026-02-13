import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Application, EmailTemplate, PipelineStage } from "@shared/schema";
import { FormTemplateDTO } from "@/lib/formsApi";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { Download, FileText, ExternalLink, AlertCircle } from "lucide-react";

interface ApplicationDetailModalProps {
  application: Application | null;
  jobId: number;
  pipelineStages: PipelineStage[];
  emailTemplates: EmailTemplate[];
  formTemplates: FormTemplateDTO[];
  stageHistory: any[];
  resumeText?: string | null;
  open: boolean;
  onClose: () => void;
  onMoveStage: (stageId: number, notes?: string) => void;
  onScheduleInterview: (data: { date: string; time: string; location: string; notes: string }) => void;
  onSendEmail: (templateId: number) => void;
  onSendForm: (formId: number, message: string) => void;
  onAddNote: (note: string) => void;
  onSetRating: (rating: number) => void;
  onDownloadResume: () => void;
  onUpdateStatus?: (status: string, notes?: string) => void;
}

export function ApplicationDetailModal({
  application,
  jobId,
  pipelineStages,
  emailTemplates,
  formTemplates,
  stageHistory,
  resumeText,
  open,
  onClose,
  onMoveStage,
  onScheduleInterview,
  onSendEmail,
  onSendForm,
  onAddNote,
  onSetRating,
  onDownloadResume,
  onUpdateStatus,
}: ApplicationDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "resume">("details");

  if (!application) return null;

  const resumeUrl = application.resumeUrl
    ? `/api/applications/${application.id}/resume`
    : null;
  // Check if resume is a PDF (most likely case)
  const nameForType = (application.resumeFilename || application.resumeUrl || '').toLowerCase();
  const isPdf = nameForType.endsWith('.pdf') || nameForType.includes('.pdf');
  const displayFilename = application.resumeFilename || application.resumeUrl?.split('/').pop() || 'Resume';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-semibold text-foreground">
                {application.name}
              </DialogTitle>
              <Badge variant="outline" className="border-info/30 text-info-foreground bg-info/10">
                {application.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{application.email}</p>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 shrink-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "resume")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="details">
                <FileText className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
              <TabsTrigger value="resume" disabled={!resumeUrl}>
                <FileText className="h-4 w-4 mr-2" />
                Resume Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "details" ? (
            <ScrollArea className="h-full">
              <div className="p-0">
                <ApplicationDetailPanel
                  application={application}
                  jobId={jobId}
                  pipelineStages={pipelineStages}
                  emailTemplates={emailTemplates}
                  formTemplates={formTemplates}
                  stageHistory={stageHistory}
                  onClose={onClose}
                  onMoveStage={onMoveStage}
                  onScheduleInterview={onScheduleInterview}
                  onSendEmail={onSendEmail}
                  onSendForm={onSendForm}
                  onAddNote={onAddNote}
                  onSetRating={onSetRating}
                  onDownloadResume={onDownloadResume}
                  {...(onUpdateStatus ? { onUpdateStatus } : {})}
                />
              </div>
            </ScrollArea>
          ) : (
            <div className="h-full flex flex-col p-4">
              {/* Resume Actions Bar */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {displayFilename}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isPdf && resumeUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(resumeUrl, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onDownloadResume}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>

              {/* Resume Preview */}
              <div className="flex-1 border border-border rounded-lg overflow-hidden bg-muted/50">
                {resumeUrl ? (
                  isPdf ? (
                    <iframe
                      src={`${resumeUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-full"
                      title="Resume Preview"
                    />
                  ) : resumeText ? (
                    <div className="h-full p-4 overflow-auto bg-white">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Resume text</p>
                      <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                        {resumeText}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Unable to preview this file type in browser.
                      </p>
                      <Button onClick={onDownloadResume}>
                        <Download className="h-4 w-4 mr-2" />
                        Download to View
                      </Button>
                    </div>
                  )
                ) : resumeText ? (
                  <div className="h-full p-4 overflow-auto bg-white">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Resume text</p>
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                      {resumeText}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <AlertCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No resume available</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
