import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Type, AlignLeft, Mail, ToggleLeft, ChevronDown, Calendar, Upload } from "lucide-react";

const FIELD_TYPES = [
  { type: "short_text", label: "Short Text", icon: Type, description: "Single line text input" },
  { type: "long_text", label: "Long Text", icon: AlignLeft, description: "Multi-line paragraph" },
  { type: "email", label: "Email", icon: Mail, description: "Email address field" },
  { type: "yes_no", label: "Yes/No", icon: ToggleLeft, description: "Boolean toggle" },
  { type: "select", label: "Dropdown", icon: ChevronDown, description: "Select from options" },
  { type: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { type: "file", label: "File Upload", icon: Upload, description: "File attachment" },
];

interface FieldPaletteProps {
  onAddField: (type: string) => void;
}

function DraggableFieldType({ type, label, icon: Icon, description }: typeof FIELD_TYPES[number]) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: {
      type: "palette-field",
      fieldType: type,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : ""}
    >
      <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-move">
        <CardContent className="p-3">
          <div
            {...attributes}
            {...listeners}
            className="flex items-start gap-3"
          >
            <div className="bg-primary/20 p-2 rounded-md">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-sm font-medium">{label}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function FieldPalette({ onAddField }: FieldPaletteProps) {
  return (
    <div className="h-full bg-card border-r border-border overflow-y-auto">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-foreground font-semibold text-lg">Field Types</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Drag fields to the canvas or click to add
          </p>
        </div>

        <div className="space-y-2">
          {FIELD_TYPES.map((fieldType) => (
            <div key={fieldType.type} onClick={() => onAddField(fieldType.type)}>
              <DraggableFieldType {...fieldType} />
            </div>
          ))}
        </div>

        {/* Field Presets Section */}
        <div className="pt-4 border-t border-border">
          <h3 className="text-foreground font-medium text-sm mb-2">Quick Presets</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onAddField("short_text");
                onAddField("email");
                onAddField("yes_no");
              }}
              className="w-full justify-start border-border text-muted-foreground hover:bg-accent hover:text-foreground text-xs"
            >
              Basic Contact Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onAddField("short_text");
                onAddField("long_text");
                onAddField("file");
              }}
              className="w-full justify-start border-border text-muted-foreground hover:bg-accent hover:text-foreground text-xs"
            >
              Document Submission
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onAddField("short_text");
                onAddField("date");
                onAddField("yes_no");
              }}
              className="w-full justify-start border-border text-muted-foreground hover:bg-accent hover:text-foreground text-xs"
            >
              Background Check
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
