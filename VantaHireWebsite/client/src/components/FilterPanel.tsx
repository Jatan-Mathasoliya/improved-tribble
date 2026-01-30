import { useState } from "react";
import { Search, MapPin, Filter, Briefcase, X, SlidersHorizontal, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  search: string;
  setSearch: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
  type: string;
  setType: (value: string) => void;
  minSalary: string;
  setMinSalary: (value: string) => void;
  maxSalary: string;
  setMaxSalary: (value: string) => void;
  salaryPeriod: string;
  setSalaryPeriod: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  className?: string;
}

function FilterContent({
  search,
  setSearch,
  location,
  setLocation,
  type,
  setType,
  minSalary,
  setMinSalary,
  maxSalary,
  setMaxSalary,
  salaryPeriod,
  setSalaryPeriod,
  onApplyFilters,
  onResetFilters,
  showButtons = true
}: FilterPanelProps & { showButtons?: boolean }): JSX.Element {

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="search" className="text-sm font-medium flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Keyword Search
        </Label>
        <div className="relative group">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="search"
            placeholder="Job title, keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-purple-400/20"
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="location" className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Location
        </Label>
        <div className="relative group">
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            id="location"
            placeholder="City, state, country..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-purple-400/20"
          />
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Job Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Job Type
        </Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="bg-white/5 border-white/20 text-white focus:border-primary focus:ring-2 focus:ring-purple-400/20">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full-time">Full-time</SelectItem>
            <SelectItem value="part-time">Part-time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="internship">Internship</SelectItem>
            <SelectItem value="temporary">Temporary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Salary Range */}
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
          <IndianRupee className="h-4 w-4 text-primary" />
          Salary Range
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="minSalary"
            placeholder="Min"
            type="number"
            value={minSalary}
            onChange={(e) => setMinSalary(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
            className="bg-white/5 border-white/20 text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-purple-400/20"
          />
          <span className="text-white">-</span>
          <Input
            id="maxSalary"
            placeholder="Max"
            type="number"
            value={maxSalary}
            onChange={(e) => setMaxSalary(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
            className="bg-white/5 border-white/20 text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-purple-400/20"
          />
        </div>
        <Select value={salaryPeriod} onValueChange={setSalaryPeriod}>
          <SelectTrigger className="bg-white/5 border-white/20 text-white focus:border-primary focus:ring-2 focus:ring-purple-400/20 mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="per_year">Per Year</SelectItem>
            <SelectItem value="per_month">Per Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showButtons && (
        <>
          <Separator className="bg-white/10" />
          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={onApplyFilters}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
            >
              <Filter className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
            <Button
              onClick={onResetFilters}
              variant="outline"
              className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <X className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function FilterPanel(props: FilterPanelProps) {
  return (
    <div className={cn("space-y-6", props.className)}>
      <div className="sticky top-4">
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-white">Filters</h2>
          </div>
          <FilterContent {...props} />
        </div>
      </div>
    </div>
  );
}

export function MobileFilterSheet(props: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const handleApply = () => {
    props.onApplyFilters();
    setOpen(false);
  };

  const handleReset = () => {
    props.onResetFilters();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-card/95 backdrop-blur-sm border-white/20 text-white overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Filter Jobs
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <FilterContent
            {...props}
            onApplyFilters={handleApply}
            onResetFilters={handleReset}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}