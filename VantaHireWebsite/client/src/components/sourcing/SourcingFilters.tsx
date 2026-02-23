import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SourcingFilterState {
  identityStatus: string[];
  enrichedOnly: boolean;
  location: string;
  seniority: string;
  candidateState: string[];
}

export const defaultFilters: SourcingFilterState = {
  identityStatus: [],
  enrichedOnly: false,
  location: "",
  seniority: "all",
  candidateState: [],
};

interface SourcingFiltersProps {
  filters: SourcingFilterState;
  onChange: (filters: SourcingFilterState) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  resultCount: number;
  totalCount: number;
}

function ToggleBadge({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Badge
      variant={active ? "default" : "outline"}
      className={cn("cursor-pointer select-none", active && "bg-primary")}
      onClick={onClick}
    >
      {label}
    </Badge>
  );
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function SourcingFilters({
  filters,
  onChange,
  sortBy,
  onSortChange,
  resultCount,
  totalCount,
}: SourcingFiltersProps) {
  const update = (partial: Partial<SourcingFilterState>) =>
    onChange({ ...filters, ...partial });

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Identity status toggles */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground mr-1">Identity</Label>
            <ToggleBadge
              label="Verified"
              active={filters.identityStatus.includes("verified")}
              onClick={() =>
                update({ identityStatus: toggleInArray(filters.identityStatus, "verified") })
              }
            />
            <ToggleBadge
              label="Review"
              active={filters.identityStatus.includes("review")}
              onClick={() =>
                update({ identityStatus: toggleInArray(filters.identityStatus, "review") })
              }
            />
            <ToggleBadge
              label="Weak"
              active={filters.identityStatus.includes("weak")}
              onClick={() =>
                update({ identityStatus: toggleInArray(filters.identityStatus, "weak") })
              }
            />
          </div>

          {/* Enriched toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="enriched-only"
              checked={filters.enrichedOnly}
              onCheckedChange={(checked) => update({ enrichedOnly: checked })}
            />
            <Label htmlFor="enriched-only" className="text-xs text-muted-foreground">
              Enriched only
            </Label>
          </div>

          {/* Location text filter */}
          <Input
            placeholder="Filter by location..."
            value={filters.location}
            onChange={(e) => update({ location: e.target.value })}
            className="w-40 h-8 text-sm"
          />

          {/* Seniority select */}
          <Select
            value={filters.seniority}
            onValueChange={(val) => update({ seniority: val })}
          >
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="Seniority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="junior">Junior</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>

          {/* Candidate state toggles */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground mr-1">State</Label>
            <ToggleBadge
              label="New"
              active={filters.candidateState.includes("new")}
              onClick={() =>
                update({ candidateState: toggleInArray(filters.candidateState, "new") })
              }
            />
            <ToggleBadge
              label="Shortlisted"
              active={filters.candidateState.includes("shortlisted")}
              onClick={() =>
                update({
                  candidateState: toggleInArray(filters.candidateState, "shortlisted"),
                })
              }
            />
            <ToggleBadge
              label="Hidden"
              active={filters.candidateState.includes("hidden")}
              onClick={() =>
                update({ candidateState: toggleInArray(filters.candidateState, "hidden") })
              }
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fitScore">Fit Score</SelectItem>
              <SelectItem value="source">Source Priority</SelectItem>
              <SelectItem value="freshness">Freshness</SelectItem>
            </SelectContent>
          </Select>

          {/* Result count */}
          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            Showing {resultCount} of {totalCount} candidates
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
