import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Redirect } from "wouter";
import { DndContext, DragEndEvent, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Eye, Loader2, Sparkles, X } from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formsApi, formsQueryKeys, type FormTemplateDTO, type CreateTemplateRequest, type InvitationQuotaResponse } from "@/lib/formsApi";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FieldPalette } from "@/components/forms/FieldPalette";
import { FormCanvas } from "@/components/forms/FormCanvas";
import { FieldPropertiesPanel } from "@/components/forms/FieldPropertiesPanel";
import { FormPreviewDialog } from "@/components/forms/FormPreviewDialog";

export interface FieldData {
  id: string; // Unique ID for drag-drop
  type: string;
  label: string;
  required: boolean;
  options: string | undefined;
  order: number;
}

export default function FormEditorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/forms/editor/:id?");

  const templateId = params?.id && params.id !== "new" ? parseInt(params.id) : null;
  const isEditMode = templateId !== null;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // AI generation state
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  const availableGoals = [
    { value: "communication", label: "Communication" },
    { value: "technical_depth", label: "Technical Depth" },
    { value: "culture_fit", label: "Culture Fit" },
    { value: "problem_solving", label: "Problem Solving" },
    { value: "leadership", label: "Leadership" },
  ];

  // Redirect if not admin or recruiter
  if (user && !['super_admin', 'recruiter'].includes(user.role)) {
    return <Redirect to="/jobs" />;
  }

  // Fetch template if editing
  const { data: template, isLoading: isLoadingTemplate } = useQuery({
    queryKey: formsQueryKeys.templateDetail(templateId!),
    queryFn: () => formsApi.getTemplate(templateId!),
    enabled: isEditMode && !!user,
  });

  // Fetch user's jobs for AI generation
  const { data: jobs = [] } = useQuery<Array<{ id: number; title: string }>>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user && showAIDialog,
  });

  // Fetch invitation quota (daily limit info)
  const { data: invitationQuota } = useQuery<InvitationQuotaResponse>({
    queryKey: formsQueryKeys.invitationQuota(),
    queryFn: () => formsApi.getInvitationQuota(),
    enabled: !!user,
    staleTime: 60_000, // Cache for 1 minute
  });

  // AI generation mutation
  const aiGenerateMutation = useMutation({
    mutationFn: async ({ jobId, goals }: { jobId?: number; goals: string[] }) => {
      const res = await apiRequest("POST", "/api/forms/ai-suggest", {
        jobId,
        goals,
      });
      return await res.json();
    },
    onSuccess: (data: { fields: Array<{ label: string; description?: string; fieldType: string; required: boolean; options?: string[] }> }) => {
      // Convert AI suggestions to FieldData format and append to existing fields
      const newFields: FieldData[] = data.fields.map((field, index) => ({
        id: `ai-field-${Date.now()}-${index}`,
        type: field.fieldType,
        label: field.label,
        required: field.required,
        options: field.options && field.fieldType === 'select'
          ? field.options.join(', ')
          : undefined,
        order: fields.length + index,
      }));

      setFields([...fields, ...newFields]);
      setShowAIDialog(false);
      setSelectedJobId("");
      setSelectedGoals([]);

      toast({
        title: "AI Questions Generated",
        description: `Added ${newFields.length} AI-suggested questions to your form.`,
      });
    },
    onError: (error: Error) => {
      const is429 = error.message.includes("429");
      toast({
        title: is429 ? "AI limit reached" : "AI generation failed",
        description: is429
          ? "You've reached today's AI form generation limit. Please try again tomorrow."
          : error.message,
        variant: "destructive",
      });
    },
  });

  // Initialize form when template loads
  useEffect(() => {
    if (isEditMode && template) {
      setName(template.name);
      setDescription(template.description || "");
      setIsPublished(template.isPublished);
      setFields(
        template.fields
          .sort((a, b) => (a.order - b.order) || (a.id - b.id))
          .map((f, index) => ({
            id: `field-${index}-${Date.now()}`,
            type: f.type,
            label: f.label,
            required: f.required,
            options: f.options
              ? (f.type === 'select'
                  ? (JSON.parse(f.options) as string[]).join(', ')
                  : f.options)
              : undefined,
            order: f.order,
          }))
      );
    }
  }, [isEditMode, template]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTemplateRequest) => formsApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.templates() });
      toast({
        title: "Template Created",
        description: "Form template has been created successfully.",
      });
      navigate("/admin/forms");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Template",
        description: error.message || "Failed to create form template.",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => formsApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.templates() });
      queryClient.invalidateQueries({ queryKey: formsQueryKeys.templateDetail(templateId!) });
      toast({
        title: "Template Updated",
        description: "Form template has been updated successfully.",
      });
      navigate("/admin/forms");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Template",
        description: error.message || "Failed to update form template.",
        variant: "destructive",
      });
    },
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Template name is required";
    }

    if (fields.length === 0) {
      newErrors.fields = "At least one field is required";
    }

    fields.forEach((field) => {
      if (!field.label.trim()) {
        newErrors[`field_${field.id}_label`] = "Field label is required";
      }
      if (field.type === "select" && !field.options?.trim()) {
        newErrors[`field_${field.id}_options`] = "Options are required for select fields";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors before saving.",
        variant: "destructive",
      });
      return;
    }

    const descriptionValue = description.trim();
    const data: CreateTemplateRequest = {
      name: name.trim(),
      ...(descriptionValue && { description: descriptionValue }),
      isPublished,
      fields: fields.map((field, index) => {
        const baseField = {
          type: field.type,
          label: field.label.trim(),
          required: field.required,
          order: index,
        };
        if (field.type === "select" && field.options) {
          return {
            ...baseField,
            options: JSON.stringify(field.options.split(',').map(opt => opt.trim()).filter(Boolean))
          };
        }
        return baseField;
      }),
    };

    if (isEditMode && templateId) {
      updateMutation.mutate({ id: templateId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const MAX_FIELDS = 50;

  const addField = (type: string) => {
    if (fields.length >= MAX_FIELDS) {
      toast({
        title: "Field limit reached",
        description: `Forms can have a maximum of ${MAX_FIELDS} fields. Remove existing fields to add more.`,
        variant: "destructive",
      });
      return;
    }
    const newField: FieldData = {
      id: `field-${Date.now()}-${Math.random()}`,
      type,
      label: "",
      required: false,
      options: undefined,
      order: fields.length,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const duplicateField = (fieldId: string) => {
    if (fields.length >= MAX_FIELDS) {
      toast({
        title: "Field limit reached",
        description: `Forms can have a maximum of ${MAX_FIELDS} fields. Remove existing fields to add more.`,
        variant: "destructive",
      });
      return;
    }
    const fieldToDuplicate = fields.find(f => f.id === fieldId);
    if (!fieldToDuplicate) return;

    const newField: FieldData = {
      ...fieldToDuplicate,
      id: `field-${Date.now()}-${Math.random()}`,
      label: `${fieldToDuplicate.label} (Copy)`,
      order: fields.length,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const removeField = (fieldId: string) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  };

  const updateField = (fieldId: string, updates: Partial<FieldData>) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const reorderFields = (newFields: FieldData[]) => {
    setFields(newFields.map((f, index) => ({ ...f, order: index })));
  };

  // AI generation handlers
  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal)
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const handleGenerateWithAI = () => {
    const hasJobSelected = selectedJobId && selectedJobId !== "none";
    if (!hasJobSelected && selectedGoals.length === 0) {
      toast({
        title: "Selection Required",
        description: "Please select a job or at least one assessment goal.",
        variant: "destructive",
      });
      return;
    }

    const payload: { jobId?: number; goals: string[] } = {
      goals: selectedGoals,
    };
    if (hasJobSelected) {
      payload.jobId = parseInt(selectedJobId);
    }

    aiGenerateMutation.mutate(payload);
  };

  // Drag-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag over for real-time sorting
  const handleDragOver = (event: any) => {
    const { active, over } = event;

    if (!over || !active) return;

    // Skip if dragging from palette
    if (active.data.current?.type === "palette-field") return;

    // Handle canvas field reordering
    if (active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(fields, oldIndex, newIndex);
        setFields(reordered.map((f, index) => ({ ...f, order: index })));
      }
    }
  };

  // Handle drag from palette or finalize canvas reorder
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    // Check if dragging from palette
    if (active.data.current?.type === "palette-field") {
      const fieldType = active.data.current.fieldType;
      if (fieldType) {
        addField(fieldType);
      }
      return;
    }
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditMode && isLoadingTemplate) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border p-4 shadow-sm">
          <div className="max-w-full mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/forms")}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name" className="text-foreground text-sm">
                    Template Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Background Check Authorization"
                    className="mt-1"
                  />
                  {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="description" className="text-foreground text-sm">
                    Description (Optional)
                  </Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description..."
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Field counter - shows current/max with color coding */}
              <Badge
                variant="outline"
                className={`text-xs ${
                  fields.length >= 50
                    ? 'bg-destructive/10 text-destructive border-destructive/30'
                    : fields.length >= 40
                    ? 'bg-warning/10 text-warning-foreground border-warning/30'
                    : 'bg-muted/50 text-muted-foreground border-border'
                }`}
              >
                {fields.length}/50 fields
              </Badge>
              {/* Invite quota hint - shows remaining daily invites */}
              {invitationQuota && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    invitationQuota.remaining === 0
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : invitationQuota.remaining <= 10
                      ? 'bg-warning/10 text-warning-foreground border-warning/30'
                      : 'bg-info/10 text-info-foreground border-info/30'
                  }`}
                >
                  {invitationQuota.remaining}/{invitationQuota.limit} invites today
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="isPublished"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
                <Label htmlFor="isPublished" className="text-foreground text-sm cursor-pointer whitespace-nowrap">
                  Published
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAIDialog(true)}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate with AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(true)}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button
                onClick={handleSave}
                disabled={isPending}
                size="sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
          {errors.fields && <p className="text-destructive text-sm mt-2">{errors.fields}</p>}
        </div>

        {/* Three-Panel Layout */}
        <div className="flex-1 overflow-hidden">
          <DndContext sensors={sensors} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <ResizablePanelGroup direction="horizontal">
              {/* Left Panel - Field Palette */}
              <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
                <FieldPalette onAddField={addField} />
              </ResizablePanel>

              <ResizableHandle className="w-1 bg-slate-300 hover:bg-primary transition-colors" />

              {/* Center Panel - Form Canvas */}
              <ResizablePanel defaultSize={50} minSize={30}>
                <FormCanvas
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  onSelectField={setSelectedFieldId}
                  onReorderFields={reorderFields}
                  onRemoveField={removeField}
                  onDuplicateField={duplicateField}
                  errors={errors}
                />
              </ResizablePanel>

              <ResizableHandle className="w-1 bg-slate-300 hover:bg-primary transition-colors" />

              {/* Right Panel - Field Properties */}
              <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
                <FieldPropertiesPanel
                  field={selectedField}
                  onUpdateField={(updates) => selectedField && updateField(selectedField.id, updates)}
                  errors={errors}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </DndContext>
        </div>

        {/* AI Generation Dialog */}
        <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Questions with AI</DialogTitle>
              <DialogDescription>
                AI will create screening questions based on a job description and your assessment goals.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Job Selection (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="job-select">Link to Job (Optional)</Label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger id="job-select">
                    <SelectValue placeholder="Select a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id.toString()}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  AI will use the job description and skills to create relevant questions
                </p>
              </div>

              {/* Assessment Goals */}
              <div className="space-y-2">
                <Label>Assessment Goals</Label>
                <div className="flex flex-wrap gap-2">
                  {availableGoals.map((goal) => (
                    <Badge
                      key={goal.value}
                      variant={selectedGoals.includes(goal.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleGoal(goal.value)}
                    >
                      {selectedGoals.includes(goal.value) && (
                        <X className="w-3 h-3 mr-1" />
                      )}
                      {goal.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select focus areas for question generation
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAIDialog(false);
                  setSelectedJobId("");
                  setSelectedGoals([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateWithAI}
                disabled={aiGenerateMutation.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {aiGenerateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <FormPreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          templateName={name}
          fields={fields}
        />
      </div>
    </Layout>
  );
}
