import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FieldData } from "@/pages/form-editor-page";

interface FormPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  fields: FieldData[];
}

export function FormPreviewDialog({ open, onOpenChange, templateName, fields }: FormPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground text-2xl flex items-center gap-2">
            Form Preview
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              Candidate View
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            This is how candidates will see and interact with your form
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          {/* Form Header */}
          <div className="mb-6 pb-6 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">
              {templateName || "Untitled Form"}
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              Please fill out all required fields marked with an asterisk (*)
            </p>
          </div>

          {/* Form Fields */}
          {fields.length === 0 ? (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No fields to preview. Add fields to see them here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-foreground text-base">
                    {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>

                  {field.type === "short_text" && (
                    <Input
                      placeholder="Enter your response..."
                      className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                    />
                  )}

                  {field.type === "long_text" && (
                    <Textarea
                      placeholder="Enter your detailed response..."
                      rows={4}
                      className="bg-background border-input text-foreground placeholder:text-muted-foreground resize-none"
                    />
                  )}

                  {field.type === "email" && (
                    <Input
                      type="email"
                      placeholder="your.email@example.com"
                      className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                    />
                  )}

                  {field.type === "yes_no" && (
                    <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-lg border border-border">
                      <Switch />
                      <span className="text-muted-foreground text-sm">Toggle to select Yes/No</span>
                    </div>
                  )}

                  {field.type === "select" && (
                    <Select>
                      <SelectTrigger className="bg-background border-input text-foreground">
                        <SelectValue placeholder="Select an option..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options
                          ? field.options.split(',').map((opt, i) => {
                              const trimmed = opt.trim();
                              return trimmed ? (
                                <SelectItem key={i} value={trimmed}>
                                  {trimmed}
                                </SelectItem>
                              ) : null;
                            })
                          : (
                            <SelectItem value="no-options" disabled>
                              No options defined
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  )}

                  {field.type === "date" && (
                    <Input
                      type="date"
                      className="bg-background border-input text-foreground"
                    />
                  )}

                  {field.type === "file" && (
                    <div className="space-y-2">
                      <Input
                        type="file"
                        className="bg-background border-input text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                      />
                      <p className="text-muted-foreground text-xs">
                        Supported formats: PDF, DOC, DOCX, TXT (max 10MB)
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {/* Submit Button (Preview Only) */}
              <div className="pt-6 border-t border-border">
                <Button
                  disabled
                  size="lg"
                  className="w-full"
                >
                  Submit Form
                </Button>
                <p className="text-muted-foreground text-xs mt-2 text-center">
                  This is a preview only. Candidates will submit their responses here.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
