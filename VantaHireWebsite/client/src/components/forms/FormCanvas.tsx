import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Trash2, Copy, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldData } from "@/pages/form-editor-page";

const FIELD_TYPE_LABELS: Record<string, string> = {
  short_text: "Short Text",
  long_text: "Long Text",
  email: "Email",
  yes_no: "Yes/No",
  select: "Dropdown",
  date: "Date",
  file: "File Upload",
};

interface FieldCardProps {
  field: FieldData;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  hasError: boolean;
}

function SortableFieldCard({ field, isSelected, onSelect, onRemove, onDuplicate, hasError }: FieldCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("mb-3", isDragging && "opacity-50")}>
      <Card
        className={cn(
          "bg-card border-border hover:bg-accent/50 transition-all cursor-pointer",
          isSelected && "ring-2 ring-primary",
          hasError && "border-red-400/50"
        )}
        onClick={onSelect}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1 focus:outline-none focus:ring-2 focus:ring-primary rounded"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Drag to reorder ${field.label || 'field'}`}
            >
              <GripVertical className="h-5 w-5" />
            </button>

            {/* Field Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      {FIELD_TYPE_LABELS[field.type] || field.type}
                    </Badge>
                    {field.required && (
                      <Badge variant="outline" className="text-xs border-info/50 text-info">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-foreground text-sm font-medium mt-1 truncate">
                    {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
                  </p>
                  {field.type === "select" && field.options && (
                    <p className="text-muted-foreground text-xs mt-1 truncate">
                      Options: {field.options}
                    </p>
                  )}
                  {hasError && (
                    <div className="flex items-center gap-1 text-destructive text-xs mt-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>This field has errors</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDuplicate}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                title="Duplicate field"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-900/20"
                title="Delete field"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface FormCanvasProps {
  fields: FieldData[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onReorderFields: (fields: FieldData[]) => void;
  onRemoveField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  errors: Record<string, string>;
}

export function FormCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onReorderFields,
  onRemoveField,
  onDuplicateField,
  errors,
}: FormCanvasProps) {
  // Make the canvas droppable for palette items
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-drop-zone",
    data: {
      type: "canvas",
    },
  });

  const hasFieldError = (fieldId: string) => {
    return Object.keys(errors).some(key => key.startsWith(`field_${fieldId}_`));
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-full bg-muted overflow-y-auto transition-colors",
        isOver && "bg-muted/80"
      )}
    >
      <div className="p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-foreground font-semibold text-lg">Form Canvas</h2>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                fields.length >= 50
                  ? "border-red-400 text-destructive"
                  : fields.length >= 40
                  ? "border-amber-400 text-warning"
                  : "border-slate-500 text-muted-foreground"
              )}
            >
              {fields.length} / 50 fields
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Drag fields from palette or reorder existing fields. Click to edit properties.
          </p>
          {fields.length >= 50 && (
            <p className="text-destructive text-xs mt-2">
              Maximum field limit reached. Remove fields to add more.
            </p>
          )}
        </div>

        {fields.length === 0 ? (
          <Card className={cn(
            "bg-card border-border border-dashed transition-colors",
            isOver && "border-primary bg-primary/10"
          )}>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No fields yet. Drag fields from the palette or click to add.</p>
            </CardContent>
          </Card>
        ) : (
          <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0">
              {fields.map((field) => (
                <SortableFieldCard
                  key={field.id}
                  field={field}
                  isSelected={selectedFieldId === field.id}
                  onSelect={() => onSelectField(field.id)}
                  onRemove={() => onRemoveField(field.id)}
                  onDuplicate={() => onDuplicateField(field.id)}
                  hasError={hasFieldError(field.id)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
