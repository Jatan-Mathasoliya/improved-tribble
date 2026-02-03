import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { PipelineStage } from "@shared/schema";
import { type NotesData } from "./types";

interface NotesSectionProps {
  data: NotesData;
  onChange: (data: NotesData) => void;
  onValidChange: (isValid: boolean) => void;
  pipelineStages: PipelineStage[];
}

const SOURCE_OPTIONS = [
  { value: "recruiter_add", label: "Added by Recruiter" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "other", label: "Other" },
];

export function NotesSection({
  data,
  onChange,
  onValidChange,
  pipelineStages,
}: NotesSectionProps) {
  // Notes are optional, so always valid
  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const sortedStages = [...pipelineStages].sort((a, b) => (a.order - b.order) || (a.id - b.id));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Internal Notes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Add sourcing details and internal notes (not visible to candidate)
        </p>
      </div>

      {/* Source */}
      <div className="space-y-2">
        <Label>Candidate Source</Label>
        <Select
          value={data.source}
          onValueChange={(value: NotesData["source"]) =>
            onChange({ ...data, source: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Referrer (conditional) */}
      {data.source === "referral" && (
        <div className="space-y-2">
          <Label htmlFor="referrer">Referred By</Label>
          <Input
            id="referrer"
            value={data.referrer}
            onChange={(e) => onChange({ ...data, referrer: e.target.value })}
            placeholder="Name of referrer or employee"
          />
        </div>
      )}

      {/* Initial Pipeline Stage */}
      <div className="space-y-2">
        <Label>Initial Pipeline Stage</Label>
        <Select
          value={data.initialStageId?.toString() || ""}
          onValueChange={(value) =>
            onChange({
              ...data,
              initialStageId: value ? parseInt(value, 10) : null,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Auto-assign to default stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-assign to default stage</SelectItem>
            {sortedStages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id.toString()}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: stage.color || "#6b7280" }}
                  />
                  {stage.name}
                  {stage.isDefault && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      Default
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose where this candidate should start in your pipeline
        </p>
      </div>

      {/* Internal Notes */}
      <div className="space-y-2">
        <Label htmlFor="internalNotes">Internal Notes</Label>
        <Textarea
          id="internalNotes"
          value={data.internalNotes}
          onChange={(e) => onChange({ ...data, internalNotes: e.target.value })}
          placeholder="Add any internal notes about this candidate... (not visible to candidate)"
          rows={5}
        />
        <p className="text-xs text-muted-foreground">
          {(data.internalNotes?.length || 0).toLocaleString()}/2,000 characters
        </p>
      </div>

      {/* Summary Card */}
      <div className="bg-muted/50 rounded-lg p-4 border border-border">
        <h4 className="text-sm font-medium text-foreground mb-2">
          Ready to Submit
        </h4>
        <p className="text-sm text-muted-foreground">
          Review all sections in the left navigation. Required sections must be
          complete before submitting. Click "Add Candidate" below to create the
          application.
        </p>
      </div>
    </div>
  );
}
